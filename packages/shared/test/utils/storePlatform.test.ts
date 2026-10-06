import { describe, it, expect } from 'vitest';
import { resolveStorePlatform } from '../../src/utils/storePlatform';

// Real user-agent strings. UA sniffing only stays correct if it is tested
// against what browsers actually send, not against what we imagine they send.
const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1',
  iphoneFirefox:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15',
  iphoneInstagram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 334.0.0.31.99',
  ipadLegacy:
    'Mozilla/5.0 (iPad; CPU OS 12_5_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1.2 Mobile/15E148 Safari/604.1',
  ipadOS13:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  ipod:
    'Mozilla/5.0 (iPod touch; CPU iPhone OS 15_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1',
  androidPhone:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  androidTablet:
    'Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  androidFacebook:
    'Mozilla/5.0 (Linux; Android 14; SM-S911B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/468.0.0.48.76;]',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  windows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  linux:
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  windowsPhone:
    'Mozilla/5.0 (Windows Phone 10.0; Android 6.0.1; Microsoft; Lumia 950) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/52.0.2743.116 Mobile Safari/537.36 Edge/15.15254',
  windowsTouch:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; Touch) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
};

describe('resolveStorePlatform', () => {
  it.each([
    ['iPhone Safari', UA.iphoneSafari],
    ['iPhone Chrome (CriOS)', UA.iphoneChrome],
    ['iPhone Firefox (FxiOS)', UA.iphoneFirefox],
    ['the Instagram in-app browser', UA.iphoneInstagram],
    ['an iPad on iOS 12', UA.ipadLegacy],
    ['an iPod touch', UA.ipod],
  ])('resolves %s to ios', (_label, ua) => {
    expect(resolveStorePlatform(ua, 0)).toBe('ios');
  });

  it.each([
    ['an Android phone', UA.androidPhone],
    ['an Android tablet (no "Mobile" token)', UA.androidTablet],
    ['the Facebook in-app browser', UA.androidFacebook],
  ])('resolves %s to android', (_label, ua) => {
    expect(resolveStorePlatform(ua, 0)).toBe('android');
  });

  it.each([
    ['macOS', UA.mac],
    ['Windows', UA.windows],
    ['Linux', UA.linux],
  ])('resolves %s to null', (_label, ua) => {
    expect(resolveStorePlatform(ua, 0)).toBeNull();
  });

  // iPadOS 13+ deliberately reports the desktop Safari UA — the ONLY signal
  // separating it from a real Mac is that it reports touch points.
  it('resolves an iPadOS 13+ tablet to ios via maxTouchPoints', () => {
    expect(resolveStorePlatform(UA.ipadOS13, 5)).toBe('ios');
  });

  it('leaves a real Mac as null even though its UA is identical', () => {
    expect(resolveStorePlatform(UA.ipadOS13, 0)).toBeNull();
  });

  // A touchscreen Windows laptop also reports maxTouchPoints > 0; the Mac
  // check must not generalise into "any touch device is an iPad".
  it('leaves a touchscreen Windows laptop as null', () => {
    expect(resolveStorePlatform(UA.windowsTouch, 10)).toBeNull();
  });

  it('does not mistake Windows Phone for Android', () => {
    expect(resolveStorePlatform(UA.windowsPhone, 0)).toBeNull();
  });

  it.each<[string | null | undefined]>([[null], [undefined], ['']])(
    'resolves %s to null',
    (ua) => {
      expect(resolveStorePlatform(ua, 0)).toBeNull();
    },
  );
});
