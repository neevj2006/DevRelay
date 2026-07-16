import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type DataColumn<Row> = {
  id: string;
  header: string;
  cell: (row: Row) => React.ReactNode;
  className?: string;
};

export function ResponsiveDataTable<Row>({
  caption,
  columns,
  rows,
  getRowKey,
  className,
}: {
  caption: string;
  columns: ReadonlyArray<DataColumn<Row>>;
  rows: ReadonlyArray<Row>;
  getRowKey: (row: Row) => React.Key;
  className?: string;
}) {
  return (
    <div className={cn("overflow-hidden rounded-lg border bg-card", className)}>
      <div className="overflow-x-auto">
        <Table>
          <caption className="sr-only">{caption}</caption>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead className={column.className} key={column.id}>
                  {column.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={getRowKey(row)}>
                {columns.map((column) => (
                  <TableCell className={column.className} key={column.id}>
                    {column.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
