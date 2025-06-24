// app/table/[tableId]/page.tsx
import { notFound } from "next/navigation";
import { auth } from "~/server/auth";
import { api } from "~/trpc/server";
import { Header } from "~/app/_components/Header";
import { TableView } from "./tableView";

interface PageProps {
  params: {
    tableId: string;
  };
}

export default async function TablePage({ params }: PageProps) {
  const session = await auth();
  if (!session) notFound();

  const table = await api.table.getById({ id: params.tableId });
  if (!table) notFound();

  // Verify the user owns the base that contains this table
  const base = await api.base.getById({ id: table.baseId });
  if (!base || base.userId !== session.user.id) notFound();

  // Get initial data for the table
  const initialData = await api.row.getByTableId({ tableId: params.tableId });
  const initialColumns = await api.column.getByTableId({ tableId: params.tableId });

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <div className="flex-shrink-0">
        <Header />
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <TableView 
          tableId={params.tableId}
          initialData={initialData}
          initialColumns={initialColumns}
          tableName={table.name}
          baseName={base.title}
          baseId={base.id}
        />
      </div>
    </div>
  );
}