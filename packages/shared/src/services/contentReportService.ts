import {
  doc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit as fsLimit,
} from '../firebase/sdk/firestore';
import { getDb } from '../firebase';
import { contentReportsCollection, contentReportDoc } from '../firebase/refs/client';
import {
  buildContentReportData,
  type ContentReportData,
  type ReportReason,
  type ReportStatus,
  type ReportTargetKind,
} from '../models/moderation/ContentReportDataModel';

export type ContentReport = ContentReportData & { id: string };

export interface CreateContentReportInput {
  municipalityId: string;
  targetKind: ReportTargetKind;
  targetId: string;
  targetAuthorUserId?: string | null;
  reporterUserId: string;
  reason: ReportReason;
  note?: string | null;
}

/**
 * File a report. Deliberately a plain client write rather than a callable: the
 * value of a report is that it is *always* accepted — a reporter who hits an
 * error learns that abuse cannot be flagged. The rules pin `reporterUserId` to
 * the caller and `status` to 'open', which is all the server trust this needs.
 */
export async function createContentReport(input: CreateContentReportInput): Promise<string> {
  const ref = doc(contentReportsCollection(getDb()));
  await setDoc(ref, buildContentReportData(input));
  return ref.id;
}

export async function getReportsByMunicipality(
  municipalityId: string,
  options: { status?: ReportStatus; limit?: number } = {},
): Promise<ContentReport[]> {
  const q = query(
    contentReportsCollection(getDb()),
    where('municipalityId', '==', municipalityId),
    ...(options.status ? [where('status', '==', options.status)] : []),
    orderBy('createdAt', 'desc'),
    ...(options.limit ? [fsLimit(options.limit)] : []),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Moderator resolution. The rules allow this only for village/app admins. */
export async function setReportStatus(reportId: string, status: ReportStatus): Promise<void> {
  await updateDoc(contentReportDoc(getDb(), reportId), { status });
}
