import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type ChartDataRow = { label: string; values: ReadonlyArray<string | number> };

export function AccessibleChart({
  title,
  description,
  summary,
  columns,
  rows,
  children,
  className,
}: {
  title: string;
  description?: string;
  summary: string;
  columns: ReadonlyArray<string>;
  rows: ReadonlyArray<ChartDataRow>;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>
        <div aria-hidden="true" className={cn("min-h-64 w-full", rows.length === 0 && "hidden")}>
          {children}
        </div>
        <p className="mt-4 text-sm text-text-secondary">{summary}</p>
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium text-link">
            View chart data as a table
          </summary>
          <div className="mt-3 overflow-x-auto rounded-md border">
            <Table>
              <caption className="sr-only">Data for {title}</caption>
              <TableHeader>
                <TableRow>
                  {columns.map((column) => (
                    <TableHead key={column}>{column}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.label}>
                    <TableCell>{row.label}</TableCell>
                    {row.values.map((value, index) => (
                      <TableCell key={`${row.label}-${columns[index + 1]}`}>{value}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
