import { describe, expect, it } from 'vitest';
import { GROUP_NOTIFY_LEVELS, groupNotifyLevel, groupNotifyPrefs } from '../../../src/models/notification';

describe('group notify levels', () => {
  it('reads no prefs doc as avisos without the chats, the default', () => {
    expect(groupNotifyLevel(null)).toBe('avisos');
  });

  it('round-trips every level through the stored switches', () => {
    for (const level of GROUP_NOTIFY_LEVELS) expect(groupNotifyLevel(groupNotifyPrefs(level))).toBe(level);
  });

  it('counts the chats on as everything, even with the avisos muted by an older app', () => {
    expect(groupNotifyLevel({ messagesMuted: true, chatPush: true })).toBe('all');
    expect(groupNotifyLevel({ messagesMuted: true, chatPush: false })).toBe('none');
  });
});
