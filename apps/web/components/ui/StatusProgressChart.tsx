"use client"

import {
  PolarGrid,
  PolarRadiusAxis,
  RadialBar,
  RadialBarChart,
  Label
} from "recharts"

import { ChartConfig, ChartContainer } from "@/components/ui/chart"

interface StatusProgressChartProps {
  percentage: number;
  size?: "sm" | "md" | "lg"; // sm pour petit (ruban), md/lg pour plus grand si utilisé ailleurs
  showLabel?: boolean;
}

export function StatusProgressChart({ percentage, size = "sm", showLabel = true }: StatusProgressChartProps) {
  // S'assurer que le pourcentage est entre 0 et 100
  const safePercentage = Math.max(0, Math.min(100, percentage));
  
  // Données pour le graphique
  const chartData = [
    { value: safePercentage, fill: "hsl(var(--chart-2))" }
  ];

  const chartConfig = {
    value: {
      label: "Complété",
    }
  } satisfies ChartConfig;

  // Configurations de taille selon la variante
  const dimensions = {
    sm: {
      height: 42,
      innerRadius: 14,
      outerRadius: 19,
      textSize: "text-[10px]",
      valueSize: "text-xs"
    },
    md: {
      height: 120,
      innerRadius: 40,
      outerRadius: 60,
      textSize: "text-sm",
      valueSize: "text-2xl"
    },
    lg: {
      height: 200,
      innerRadius: 60,
      outerRadius: 90,
      textSize: "text-base",
      valueSize: "text-4xl"
    },
  };

  const config = dimensions[size];

  return (
    <div className="flex items-center justify-center">
      <ChartContainer
        config={chartConfig}
        className="aspect-square"
        style={{ height: config.height }}
      >
        <RadialBarChart
          data={chartData}
          startAngle={90}
          endAngle={-270}
          innerRadius={config.innerRadius}
          outerRadius={config.outerRadius}
          barSize={5}
        >
          <PolarGrid
            gridType="circle"
            radialLines={false}
            polarRadius={[config.innerRadius - 2]}
          />
          <RadialBar 
            dataKey="value" 
            background={{ fill: "hsl(var(--muted))" }}
            cornerRadius={10} 
          />
          {showLabel && (
            <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
              <Label
                content={({ viewBox }) => {
                  if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                    return (
                      <text
                        x={viewBox.cx}
                        y={viewBox.cy}
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        <tspan
                          x={viewBox.cx}
                          y={viewBox.cy}
                          className={`fill-foreground font-bold ${config.valueSize}`}
                        >
                          {Math.round(safePercentage)}%
                        </tspan>
                      </text>
                    )
                  }
                }}
              />
            </PolarRadiusAxis>
          )}
        </RadialBarChart>
      </ChartContainer>
    </div>
  )
} 