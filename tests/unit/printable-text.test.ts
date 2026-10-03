import { describe, expect, it } from 'vitest'
import { mapStrings, printableText } from '@/components/reports/pdf/printable-text'

/** A face with Latin letters and punctuation, and nothing else. */
const latinOnly = (codePoint: number) => codePoint < 0x2000

describe('printableText', () => {
  it('leaves text the face can draw exactly as written', () => {
    expect(printableText('Konsumsi telat, naïve café.', latinOnly)).toBe(
      'Konsumsi telat, naïve café.',
    )
  })

  it('drops emoji and closes the gap they leave', () => {
    expect(printableText('pulang duluan 😭🙏 ya kak', latinOnly)).toBe(
      'pulang duluan ya kak',
    )
    expect(printableText('mantap 👍🏽', latinOnly)).toBe('mantap')
  })

  it('drops a word in a script the face does not have, and keeps the rest', () => {
    expect(printableText('terima kasih 谢谢 panitia', latinOnly)).toBe(
      'terima kasih panitia',
    )
  })

  it('keeps line breaks: the summary is split into paragraphs on them', () => {
    expect(printableText('Satu. 🎉\n\nDua.', latinOnly)).toBe('Satu.\n\nDua.')
  })
})

describe('mapStrings', () => {
  it('changes every string and nothing else', () => {
    const value = {
      title: 'a',
      count: 3,
      missing: null,
      rows: [['b', 'c'], { text: 'd', flag: true }],
    }

    expect(mapStrings(value, (text) => text.toUpperCase())).toEqual({
      title: 'A',
      count: 3,
      missing: null,
      rows: [['B', 'C'], { text: 'D', flag: true }],
    })
  })
})
