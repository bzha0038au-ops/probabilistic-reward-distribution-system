<script lang="ts">
  interface ChartPoint {
    bucket: string
    cumulativeScore: number
  }

  interface ChartSeries {
    entityKey: string
    label: string
    totalScore: number
    points: ChartPoint[]
  }

  interface Props {
    series: ChartSeries[]
    emptyText: string
  }

  let { series, emptyText }: Props = $props()

  const width = 760
  const height = 280
  const padding = { top: 20, right: 20, bottom: 42, left: 46 }
  const palette = [
    "#0f766e",
    "#dc2626",
    "#2563eb",
    "#ca8a04",
    "#7c3aed",
    "#ea580c",
    "#0891b2",
    "#be185d",
  ]

  const buckets = $derived.by(() => {
    const values = new Set<string>()
    for (const item of series) {
      for (const point of item.points) {
        values.add(point.bucket)
      }
    }
    return [...values].sort((left, right) => left.localeCompare(right))
  })

  const maxScore = $derived.by(() => {
    const scores = series.flatMap((item) =>
      item.points.map((point) => point.cumulativeScore),
    )
    return Math.max(1, ...scores)
  })

  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom
  const gridValues = $derived.by(() => {
    const step = Math.max(1, Math.ceil(maxScore / 4))
    return [0, step, step * 2, step * 3, step * 4]
  })

  const getColor = (index: number) => palette[index % palette.length]

  const getX = (bucketIndex: number, bucketCount: number) => {
    if (bucketCount <= 1) {
      return padding.left + chartWidth / 2
    }

    return padding.left + (bucketIndex / (bucketCount - 1)) * chartWidth
  }

  const getY = (value: number) =>
    padding.top + chartHeight - (value / maxScore) * chartHeight

  const buildPath = (points: ChartPoint[]) => {
    if (points.length === 0 || buckets.length === 0) {
      return ""
    }

    const pointMap = new Map(points.map((point) => [point.bucket, point]))
    const commands: string[] = []

    for (const [index, bucket] of buckets.entries()) {
      const point = pointMap.get(bucket)
      if (!point) {
        continue
      }

      const x = getX(index, buckets.length)
      const y = getY(point.cumulativeScore)
      commands.push(`${commands.length === 0 ? "M" : "L"} ${x} ${y}`)
    }

    return commands.join(" ")
  }

  const formatBucket = (value: string) => {
    const parsed = new Date(value)
    return Number.isNaN(parsed.valueOf())
      ? value
      : parsed.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        })
  }
</script>

{#if series.length === 0 || buckets.length === 0}
  <div
    class="rounded-2xl border border-dashed border-base-300 px-4 py-8 text-center text-sm text-slate-500"
  >
    {emptyText}
  </div>
{:else}
  <div class="space-y-4">
    <svg
      viewBox={`0 0 ${width} ${height}`}
      class="w-full overflow-visible rounded-2xl border border-base-300 bg-white"
      role="img"
      aria-label="Collusion suspicion chart"
    >
      {#each gridValues as value}
        <line
          x1={padding.left}
          x2={width - padding.right}
          y1={getY(value)}
          y2={getY(value)}
          stroke="#e2e8f0"
          stroke-width="1"
        />
        <text
          x={padding.left - 10}
          y={getY(value) + 4}
          text-anchor="end"
          font-size="11"
          fill="#64748b"
        >
          {value}
        </text>
      {/each}

      {#each buckets as bucket, index}
        <text
          x={getX(index, buckets.length)}
          y={height - 14}
          text-anchor="middle"
          font-size="11"
          fill="#64748b"
        >
          {formatBucket(bucket)}
        </text>
      {/each}

      {#each series as item, index}
        <path
          d={buildPath(item.points)}
          fill="none"
          stroke={getColor(index)}
          stroke-width="3"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <title>{`${item.label}: ${item.totalScore}`}</title>
        </path>

        {#each item.points as point}
          {#if buckets.includes(point.bucket)}
            <circle
              cx={getX(buckets.indexOf(point.bucket), buckets.length)}
              cy={getY(point.cumulativeScore)}
              r="3.5"
              fill={getColor(index)}
            >
              <title
                >{`${item.label} · ${formatBucket(point.bucket)} · ${point.cumulativeScore}`}</title
              >
            </circle>
          {/if}
        {/each}
      {/each}
    </svg>

    <div class="grid gap-2 md:grid-cols-2">
      {#each series as item, index}
        <div
          class="flex items-center justify-between rounded-xl border border-base-300 bg-base-100 px-3 py-2 text-sm"
        >
          <div class="flex min-w-0 items-center gap-2">
            <span
              class="h-2.5 w-2.5 shrink-0 rounded-full"
              style={`background:${getColor(index)}`}
            ></span>
            <span class="truncate font-medium text-slate-800">{item.label}</span
            >
          </div>
          <span class="font-mono text-xs text-slate-500">{item.totalScore}</span
          >
        </div>
      {/each}
    </div>
  </div>
{/if}
