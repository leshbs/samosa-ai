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
import { StatTile } from '@/components/reports/stat-tile'
import { TopicTail } from '@/components/reports/topic-tail'
import { OTHER_TOPIC_LABEL, type DashboardData } from '@/modules/reporting'

/**
 * The charts of one question: tiles, sentiment, topics, keywords, and the
 * topic tail. A report with one question draws this once; a report with
 * several draws it once per question, each inside its own `ExplorerScope`, so
 * no chart ever pools answers to different questions (pilot 01, §4.4).
 */
export function QuestionCharts({ data }: { data: DashboardData }) {
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

      <Reveal>
        <ChartFrame
          title={`Kata kunci teratas (${data.keywords.length})`}
          description="Kata yang paling sering muncul. Klik satu batang untuk mencarinya di tabel di bawah."
          empty={data.keywords.length === 0}
          emptyMessage="Model tidak menandai satu pun kata kunci di sini."
          table={<TermTable terms={data.keywords} header="Kata kunci" />}
        >
          <KeywordBar keywords={data.keywords} />
        </ChartFrame>
      </Reveal>

      <TopicTail topics={data.topicTail} />
    </div>
  )
}
