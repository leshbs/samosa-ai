import { ChartFrame } from '@/components/charts/chart-frame'
import {
  SentimentTable,
  TermTable,
  TopicSentimentTable,
} from '@/components/charts/chart-tables'
// Recharts is loaded on demand; the sentiment bar is plain HTML and is not.
import { KeywordBar, TopicBar } from '@/components/charts/lazy-charts'
import { SENTIMENT_LABELS } from '@/components/charts/palette'
import { SentimentBar } from '@/components/charts/sentiment-bar'
import { Reveal, Stagger, StaggerItem } from '@/components/motion/primitives'
import { MergedTopics } from '@/components/reports/merged-topics'
import { StatTile } from '@/components/reports/stat-tile'
import { TopicTail } from '@/components/reports/topic-tail'
import { formatPercent } from '@/lib/utils'
import {
  OTHER_TOPIC_LABEL,
  formatMean,
  summarizeTail,
  type CountedTerm,
  type DashboardData,
} from '@/modules/reporting'
import type { QuestionMode } from '@/types/domain'

/**
 * The charts of one question. A report with one question draws this once; a
 * report with several draws it once per question, each inside its own
 * `ExplorerScope`, so no chart ever pools answers to different questions
 * (pilot 01, §4.4).
 *
 * What it draws depends on how the question was read (ADR-0016). Only an
 * `evaluative` question has a sentiment in it, so only it gets sentiment
 * tiles and a sentiment chart; the pilot's "100% netral" came from drawing one
 * for a question that asked which activity was the most fun.
 */
export function QuestionCharts({
  data,
  mode = 'evaluative',
  merged = [],
}: {
  data: DashboardData
  mode?: QuestionMode
  /** Topic labels this question's job counts as one topic (ADR-0018). */
  merged?: MergedGroups
}) {
  if (mode === 'thematic') return <ThematicCharts data={data} merged={merged} />
  if (mode === 'categorical') return <CategoricalCharts data={data} />
  if (mode === 'scale') return <ScaleCharts data={data} />
  return <EvaluativeCharts data={data} merged={merged} />
}

type MergedGroups = ReadonlyArray<{ term: string; from: readonly string[] }>

function EvaluativeCharts({
  data,
  merged,
}: {
  data: DashboardData
  merged: MergedGroups
}) {
  const topThree = data.topics.slice(0, 3)

  /**
   * The "Lainnya" bucket is drawn as a bar like any other so the chart accounts
   * for every tagged mention. Appended last, it reads as the floor the ranked
   * topics sit on rather than competing with them for the top spot.
   */
  const topicRows = data.topicSentimentOther
    ? [...data.topicSentiment, data.topicSentimentOther]
    : data.topicSentiment

  const topicChartDescription = data.topicSentimentOther
    ? `Panjang batang menunjukkan berapa aspirasi menyebut topik itu; warnanya menunjukkan sentimennya. “Lainnya” menggabungkan ${data.topicTail.length} topik sisanya. Klik satu batang untuk menyaring tabel di bawah.`
    : 'Panjang batang menunjukkan berapa aspirasi menyebut topik itu; warnanya menunjukkan sentimennya. Klik satu batang untuk menyaring tabel di bawah.'

  return (
    <div className="space-y-6">
      <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StaggerItem>
          <StatTile label="Total aspirasi" value={data.sentiment.total} />
        </StaggerItem>
        <StaggerItem>
          <StatTile
            label="Positif"
            value={data.sentiment.shares.positive}
            format="percent"
            detail={`${data.sentiment.counts.positive} aspirasi`}
            focus={{ sentiments: ['positive'] }}
          />
        </StaggerItem>
        <StaggerItem>
          <StatTile
            label="Negatif"
            value={data.sentiment.shares.negative}
            format="percent"
            detail={`${data.sentiment.counts.negative} aspirasi`}
            focus={{ sentiments: ['negative'] }}
          />
        </StaggerItem>
        <StaggerItem>
          <StatTile
            label="Kecenderungan"
            value={
              data.sentiment.dominant
                ? SENTIMENT_LABELS[data.sentiment.dominant]
                : 'Seimbang'
            }
            detail={
              topThree.length > 0
                ? `Topik teratas: ${topThree.map((topic) => topic.term).join(', ')}`
                : 'Belum ada topik terdeteksi'
            }
          />
        </StaggerItem>
      </Stagger>

      <Reveal>
        <ChartFrame
          title="Sebaran sentimen"
          description="Proporsi aspirasi negatif, netral, dan positif. Klik satu bagian untuk menyaring tabel di bawah."
          table={<SentimentTable data={data.sentiment} />}
        >
          <SentimentBar data={data.sentiment} />
        </ChartFrame>
      </Reveal>

      <Reveal>
        <ChartFrame
          title={`Topik teratas (${data.topicSentiment.length} dari ${data.distinctTopicCount})`}
          description={topicChartDescription}
          empty={data.topicSentiment.length === 0}
          emptyMessage="Model tidak menandai satu pun topik di sini."
          table={<TopicSentimentTable rows={topicRows} />}
        >
          <TopicBar
            rows={topicRows}
            otherTopics={data.topicTail.map((topic) => topic.term)}
            otherLabel={data.topicSentimentOther ? OTHER_TOPIC_LABEL : undefined}
          />
        </ChartFrame>
      </Reveal>

      <KeywordChart data={data} noun="Aspirasi" />

      <TopicTail topics={data.topicTail} />

      <MergedTopics groups={merged} />
    </div>
  )
}

function KeywordChart({
  data,
  noun,
}: {
  data: DashboardData
  /** What a counted row is called: an aspiration only where a judgement was asked for. */
  noun: 'Aspirasi' | 'Jawaban'
}) {
  return (
    <Reveal>
      <ChartFrame
        title={`Kata kunci teratas (${data.keywords.length})`}
        description="Kata yang paling sering muncul. Klik satu batang untuk mencarinya di tabel di bawah."
        empty={data.keywords.length === 0}
        emptyMessage="Model tidak menandai satu pun kata kunci di sini."
        table={<TermTable terms={data.keywords} header="Kata kunci" countHeader={noun} />}
      >
        <KeywordBar keywords={data.keywords} seriesName={noun} />
      </ChartFrame>
    </Reveal>
  )
}

/** The share of answers, not of mentions: "40% memilih outbound" is what is read. */
function ofAnswers(terms: readonly CountedTerm[], answers: number): CountedTerm[] {
  return terms.map((term) => ({
    ...term,
    share: answers === 0 ? 0 : term.count / answers,
  }))
}

/** The ranked terms with the tail as one last bar, so every mention is drawn. */
function withOther(top: readonly CountedTerm[], tail: readonly CountedTerm[]) {
  const other = summarizeTail(tail)
  return other ? [...top, other] : [...top]
}

/** Topics without a sentiment split: the question never asked for a judgement. */
function ThematicCharts({ data, merged }: { data: DashboardData; merged: MergedGroups }) {
  const lead = data.topics[0]
  const rows = withOther(data.topics, data.topicTail)

  return (
    <div className="space-y-6">
      <Stagger className="grid gap-4 sm:grid-cols-3">
        <StaggerItem>
          <StatTile label="Total jawaban" value={data.answers} />
        </StaggerItem>
        <StaggerItem>
          <StatTile
            label="Topik berbeda"
            value={data.distinctTopicCount}
            detail={
              merged.length > 0
                ? 'Dikelompokkan dari isi jawabannya; label yang bermakna sama dihitung satu.'
                : 'Dikelompokkan dari isi jawabannya.'
            }
          />
        </StaggerItem>
        <StaggerItem>
          <StatTile
            label="Topik teratas"
            value={lead ? lead.term : 'Belum ada'}
            detail={
              lead ? `Disebut di ${lead.count} jawaban` : 'Belum ada topik terdeteksi'
            }
            focus={lead ? { topics: [lead.term] } : undefined}
            focusHint="Lihat jawabannya"
          />
        </StaggerItem>
      </Stagger>

      <Reveal>
        <ChartFrame
          title={`Topik teratas (${data.topics.length} dari ${data.distinctTopicCount})`}
          description={
            data.topicTail.length > 0
              ? `Panjang batang menunjukkan berapa jawaban menyebut topik itu. “Lainnya” menggabungkan ${data.topicTail.length} topik sisanya. Pertanyaan ini tidak meminta penilaian, jadi tidak ada sentimen. Klik satu batang untuk menyaring tabel di bawah.`
              : 'Panjang batang menunjukkan berapa jawaban menyebut topik itu. Pertanyaan ini tidak meminta penilaian, jadi tidak ada sentimen. Klik satu batang untuk menyaring tabel di bawah.'
          }
          empty={data.topics.length === 0}
          emptyMessage="Model tidak menandai satu pun topik di sini."
          table={<TermTable terms={rows} header="Topik" countHeader="Jawaban" />}
        >
          <KeywordBar
            keywords={rows}
            focusAs="topics"
            seriesName="Jawaban"
            otherTopics={data.topicTail.map((topic) => topic.term)}
            otherLabel={data.topicTail.length > 0 ? OTHER_TOPIC_LABEL : undefined}
          />
        </ChartFrame>
      </Reveal>

      <KeywordChart data={data} noun="Jawaban" />

      <TopicTail topics={data.topicTail} />

      <MergedTopics groups={merged} />
    </div>
  )
}

/** A count per choice. No sentiment, no keywords: the answer is the choice. */
function CategoricalCharts({ data }: { data: DashboardData }) {
  const choices = ofAnswers(data.topics, data.answers)
  const tail = ofAnswers(data.topicTail, data.answers)
  const lead = choices[0]
  const rows = withOther(choices, tail)

  return (
    <div className="space-y-6">
      <Stagger className="grid gap-4 sm:grid-cols-3">
        <StaggerItem>
          <StatTile label="Total jawaban" value={data.answers} />
        </StaggerItem>
        <StaggerItem>
          <StatTile
            label="Pilihan berbeda"
            value={data.distinctTopicCount}
            detail="Ejaan yang berbeda untuk pilihan yang sama sudah disatukan."
          />
        </StaggerItem>
        <StaggerItem>
          <StatTile
            label="Paling banyak dipilih"
            value={lead ? lead.term : 'Belum ada'}
            detail={
              lead
                ? `${lead.count} jawaban · ${formatPercent(lead.share)}`
                : 'Belum ada pilihan terbaca'
            }
            focus={lead ? { topics: [lead.term] } : undefined}
            focusHint="Lihat jawabannya"
          />
        </StaggerItem>
      </Stagger>

      <Reveal>
        <ChartFrame
          title={`Pilihan jawaban (${choices.length} dari ${data.distinctTopicCount})`}
          description={
            tail.length > 0
              ? `Panjang batang menunjukkan berapa jawaban menyebut pilihan itu; satu jawaban bisa menyebut lebih dari satu. “Lainnya” menggabungkan ${tail.length} pilihan sisanya. Klik satu batang untuk melihat jawabannya di tabel di bawah.`
              : 'Panjang batang menunjukkan berapa jawaban menyebut pilihan itu; satu jawaban bisa menyebut lebih dari satu. Klik satu batang untuk melihat jawabannya di tabel di bawah.'
          }
          empty={choices.length === 0}
          emptyMessage="Tidak ada pilihan yang terbaca dari jawaban di sini."
          table={<TermTable terms={rows} header="Pilihan" countHeader="Jawaban" />}
        >
          <KeywordBar
            keywords={rows}
            focusAs="topics"
            seriesName="Jawaban"
            otherTopics={tail.map((choice) => choice.term)}
            otherLabel={tail.length > 0 ? OTHER_TOPIC_LABEL : undefined}
          />
        </ChartFrame>
      </Reveal>

      <TopicTail topics={tail} noun="pilihan" />
    </div>
  )
}

/** A distribution, its mean and its most common value. */
function ScaleCharts({ data }: { data: DashboardData }) {
  const { scale } = data
  const worded = scale.answers - scale.numericAnswers

  return (
    <div className="space-y-6">
      <Stagger className="grid gap-4 sm:grid-cols-3">
        <StaggerItem>
          <StatTile label="Total jawaban" value={scale.answers} />
        </StaggerItem>
        <StaggerItem>
          <StatTile
            label="Rata-rata"
            value={scale.mean === null ? 'Tidak ada' : formatMean(scale.mean)}
            detail={
              scale.mean === null
                ? 'Tidak ada jawaban yang berupa angka.'
                : worded > 0
                  ? `Dari ${scale.numericAnswers} jawaban berupa angka; ${worded} lainnya berupa kata.`
                  : `Dari ${scale.numericAnswers} jawaban.`
            }
          />
        </StaggerItem>
        <StaggerItem>
          <StatTile
            label="Paling sering"
            value={scale.mostCommon ?? 'Tidak ada'}
            detail={
              scale.mostCommon
                ? `${scale.mostCommonCount} jawaban · ${formatPercent(
                    scale.answers === 0 ? 0 : scale.mostCommonCount / scale.answers,
                  )}`
                : 'Tidak ada nilai yang menonjol.'
            }
          />
        </StaggerItem>
      </Stagger>

      <Reveal>
        <ChartFrame
          title="Sebaran jawaban"
          description={
            scale.otherCount > 0
              ? `Berapa jawaban memberi tiap nilai, diurutkan dari nilai terkecil. ${scale.otherCount} jawaban dengan nilai yang jarang muncul tidak digambar. Klik satu batang untuk melihat jawabannya di tabel di bawah.`
              : 'Berapa jawaban memberi tiap nilai, diurutkan dari nilai terkecil. Klik satu batang untuk melihat jawabannya di tabel di bawah.'
          }
          empty={scale.values.length === 0}
          emptyMessage="Tidak ada nilai yang terbaca dari jawaban di sini."
          table={<TermTable terms={scale.values} header="Nilai" countHeader="Jawaban" />}
        >
          <KeywordBar keywords={scale.values} focusAs="topics" seriesName="Jawaban" />
        </ChartFrame>
      </Reveal>
    </div>
  )
}
