// packages/shared/src/services/groupTaskService.ts
import { deleteDoc, doc, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from '../firebase/sdk/firestore';
import { httpsCallable } from '../firebase/sdk/functions';
import { getDb, getFirebaseFunctions } from '../firebase';
import {
  organizationTaskTemplatesCollection,
  organizationTasksCollection,
  organizationTaskWriteDoc,
} from '../firebase/refs/client';
import {
  buildGroupTaskData,
  buildTaskTemplateData,
  GroupTaskDataSchema,
  GroupTaskEditSchema,
  MAX_TEMPLATE_ITEMS,
  TaskTemplateDataSchema,
  type GroupTaskData,
  type GroupTaskEdit,
  type GroupTaskInput,
  type TaskTemplateData,
  type TaskTemplateItem,
} from '../models/organization/GroupTaskDataModel';
import {
  tasksFromTemplate,
  templateItemsFromTasks,
  type ShiftAnswer,
  type ShiftState,
} from '../models/organization/groupTaskLogic';
import { watchQuery, type Unwatch, type WatchError } from './watch';

export type GroupTask = GroupTaskData & { id: string };
export type TaskTemplate = TaskTemplateData & { id: string };

// Writes go through unconverted refs so the server stamps the time
// (`serverTimestamp()`, which rules check against `request.time`); the strict
// schema still validates each payload first, with a stand-in Date.
const rawDoc = (orgId: string, collection: 'tasks' | 'taskTemplates', id: string) =>
  organizationTaskWriteDoc(getDb(), orgId, collection, id);

// =============================================================================
// TASKS
// =============================================================================

/** Every open task of the group — the home's Próximas tareas and the Tareas screen. */
export function watchOpenGroupTasks(orgId: string, onNext: (rows: GroupTask[]) => void, onError: WatchError): Unwatch {
  return watchQuery(query(organizationTasksCollection(getDb(), orgId), where('doneAt', '==', null)), onNext, onError);
}

/** Tasks closed since `since` — the done list and the fair-share view. */
export function watchGroupTasksDoneSince(
  orgId: string,
  since: Date,
  onNext: (rows: GroupTask[]) => void,
  onError: WatchError,
): Unwatch {
  return watchQuery(query(organizationTasksCollection(getDb(), orgId), where('doneAt', '>=', since)), onNext, onError);
}

/** One event's checklist, open and done. */
export function watchEventGroupTasks(
  orgId: string,
  eventId: string,
  onNext: (rows: GroupTask[]) => void,
  onError: WatchError,
): Unwatch {
  return watchQuery(query(organizationTasksCollection(getDb(), orgId), where('eventId', '==', eventId)), onNext, onError);
}

function newTaskPayload(input: Omit<GroupTaskInput, 'createdBy' | 'createdAt'>, uid: string) {
  const data = GroupTaskDataSchema.parse(buildGroupTaskData({ ...input, createdBy: uid }));
  return { ...data, createdAt: serverTimestamp() };
}

/** Any member: add a task (a shift when `slots` is set). Returns its id. */
export async function createGroupTask(
  orgId: string,
  input: Omit<GroupTaskInput, 'createdBy' | 'createdAt'>,
  uid: string,
): Promise<string> {
  const id = doc(organizationTasksCollection(getDb(), orgId)).id;
  await setDoc(rawDoc(orgId, 'tasks', id), newTaskPayload(input, uid));
  return id;
}

/** Any member: add several tasks at once (an event's checklist, a template applied), all or none. */
export async function createGroupTasks(
  orgId: string,
  inputs: Omit<GroupTaskInput, 'createdBy' | 'createdAt'>[],
  uid: string,
): Promise<string[]> {
  if (inputs.length > MAX_TEMPLATE_ITEMS) throw new Error(`At most ${String(MAX_TEMPLATE_ITEMS)} tasks at once`);
  const batch = writeBatch(getDb());
  const ids = inputs.map((input) => {
    const id = doc(organizationTasksCollection(getDb(), orgId)).id;
    batch.set(rawDoc(orgId, 'tasks', id), newTaskPayload(input, uid));
    return id;
  });
  await batch.commit();
  return ids;
}

/**
 * Any member: change what a task is. Its answers, done state and next occurrence
 * are not edited here: those belong to `setGroupTaskDone` and the functions.
 */
export async function updateGroupTask(orgId: string, taskId: string, edit: GroupTaskEdit): Promise<void> {
  const data = GroupTaskEditSchema.parse({
    ...edit,
    title: edit.title.trim(),
    notes: edit.notes?.trim() ? edit.notes.trim() : null,
    assigneeUids: [...new Set(edit.assigneeUids)],
  });
  await updateDoc(rawDoc(orgId, 'tasks', taskId), data);
}

/**
 * Any member: tick a task done or undone.
 * Closing a recurring task makes `onGroupTaskUpdated` create the next one.
 */
export async function setGroupTaskDone(orgId: string, taskId: string, done: boolean, uid: string): Promise<void> {
  await updateDoc(rawDoc(orgId, 'tasks', taskId), done ? { doneAt: serverTimestamp(), doneBy: uid } : { doneAt: null, doneBy: null });
}

/** An admin, or the task's creator. */
export async function deleteGroupTask(orgId: string, taskId: string): Promise<void> {
  await deleteDoc(rawDoc(orgId, 'tasks', taskId));
}

/**
 * A member's answer to a volunteer shift, through the `respondToTaskShift`
 * callable: it enforces the cap atomically and promotes the waiting list.
 */
export async function respondToTaskShift(orgId: string, taskId: string, answer: ShiftAnswer): Promise<ShiftState> {
  const fn = httpsCallable<{ orgId: string; taskId: string; answer: ShiftAnswer }, { state: ShiftState }>(
    getFirebaseFunctions(),
    'respondToTaskShift',
  );
  return (await fn({ orgId, taskId, answer })).data.state;
}

// =============================================================================
// TEMPLATES — checklists dated relative to an anchor
// =============================================================================

/** Admin: the group's templates. */
export function watchTaskTemplates(orgId: string, onNext: (rows: TaskTemplate[]) => void, onError: WatchError): Unwatch {
  return watchQuery(organizationTaskTemplatesCollection(getDb(), orgId), onNext, onError);
}

/** Admin: create (`templateId` null) or replace a template. Returns its id. */
export async function saveTaskTemplate(
  orgId: string,
  templateId: string | null,
  input: { name: string; items: TaskTemplateItem[] },
  adminUid: string,
): Promise<string> {
  const data = TaskTemplateDataSchema.parse(buildTaskTemplateData({ ...input, updatedBy: adminUid }));
  const id = templateId ?? doc(organizationTaskTemplatesCollection(getDb(), orgId)).id;
  await setDoc(rawDoc(orgId, 'taskTemplates', id), { ...data, updatedAt: serverTimestamp() });
  return id;
}

/** Admin. The tasks it generated stay. */
export async function deleteTaskTemplate(orgId: string, templateId: string): Promise<void> {
  await deleteDoc(rawDoc(orgId, 'taskTemplates', templateId));
}

/** Admin: generate a template's tasks on an anchor day — an event's start (`eventId`) or a bare day. */
export async function applyTaskTemplate(
  orgId: string,
  template: Pick<TaskTemplateData, 'items'>,
  anchorOn: string,
  eventId: string | null,
  adminUid: string,
): Promise<string[]> {
  return createGroupTasks(orgId, tasksFromTemplate(template, anchorOn, { eventId, createdBy: adminUid }), adminUid);
}

/** Admin: keep a checklist (an event's tasks) as a template, dated relative to `anchorOn`. */
export async function saveTasksAsTemplate(
  orgId: string,
  name: string,
  tasks: Pick<GroupTaskData, 'title' | 'notes' | 'dueOn' | 'time' | 'slots'>[],
  anchorOn: string,
  adminUid: string,
): Promise<string> {
  return saveTaskTemplate(orgId, null, { name, items: templateItemsFromTasks(tasks, anchorOn).slice(0, MAX_TEMPLATE_ITEMS) }, adminUid);
}
