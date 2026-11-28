import { Fragment } from 'react';
import { Text as RNText, Linking } from 'react-native';
import { TEXT_SCALING } from '../../lib/text/textScaling';
import { router } from 'expo-router';
import { Text } from '../primitives';
import type { TextProps } from '../primitives/Text';
import { mentionIsNavigable, openMention } from '../../lib/newsMentions';
import { buildLinkRuns, isSafeHttpUrl } from '../../lib/linkText';
import { markPresentation } from '../../lib/markStyle';
import type { NewsMention, NewsLink, NewsMark } from '@cultuvilla/shared/models/news/NewsPostDataModel';

interface RichTextProps extends Omit<TextProps, 'children'> {
  text: string;
  mentions: NewsMention[];
  /** Stored custom-text external links indexing into `text`. */
  links?: NewsLink[];
  /** Stored formatting marks (bold/italic/underline/strikethrough) indexing into `text`. */
  marks?: NewsMark[];
  /** The pueblo the article belongs to — every mention it carries lives there. */
  villageSlug: string;
}

// Colour + weight for a link/mention span. Underline is NOT here — decoration is
// applied via style (markStyle.ts) so it composes with a strikethrough mark.
const LINK_CLASS = 'text-accent font-medium';

function openExternal(url: string) {
  if (isSafeHttpUrl(url)) void Linking.openURL(url);
}

/**
 * Render a text block with its inline `@`-mentions (in-app navigation),
 * external links — both stored custom-text links and bare URLs autolinked at
 * render — and formatting marks (bold/italic/underline/strikethrough), styled
 * and tappable. Unsafe-scheme URLs render as plain text.
 */
export function RichText({ text, mentions, links = [], marks = [], villageSlug, ...textProps }: RichTextProps) {
  const runs = buildLinkRuns(text, mentions, links, marks);
  if (runs.length === 1 && !runs[0]!.mention && !runs[0]!.link && !runs[0]!.autoUrl && !runs[0]!.marks) {
    return <Text {...textProps}>{text}</Text>;
  }

  const parts = runs.map((run, i) => {
    if (run.mention) {
      const mention = run.mention;
      const navigable = mentionIsNavigable(mention);
      const pres = markPresentation(run.marks, true);
      return (
        <RNText {...TEXT_SCALING.body}
          key={i}
          className={`${LINK_CLASS} ${pres.className}`}
          style={pres.style}
          onPress={navigable ? () => void openMention(mention, villageSlug) : undefined}
        >
          {run.text}
        </RNText>
      );
    }
    const url = run.link?.url ?? run.autoUrl;
    if (url && isSafeHttpUrl(url)) {
      const pres = markPresentation(run.marks, true);
      return (
        <RNText {...TEXT_SCALING.body}
          key={i}
          className={`${LINK_CLASS} ${pres.className}`}
          style={pres.style}
          onPress={() => openExternal(url)}
        >
          {run.text}
        </RNText>
      );
    }
    if (run.marks?.length) {
      const pres = markPresentation(run.marks, false);
      return (
        <RNText {...TEXT_SCALING.body} key={i} className={pres.className} style={pres.style}>
          {run.text}
        </RNText>
      );
    }
    return <Fragment key={i}>{run.text}</Fragment>;
  });

  return <Text {...textProps}>{parts}</Text>;
}
