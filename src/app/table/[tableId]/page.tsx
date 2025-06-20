// app/table/[tableId]/page.tsx
import { notFound } from "next/navigation";
import { auth } from "~/server/auth";
import { api } from "~/trpc/server";
import { Header } from "~/app/_components/Header";
import { TableView } from "./tableView2";

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
    <>
      <Header />
      <main className="max-w-7xl mx-auto py-8 px-4">
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-2">{table.name}</h1>
          <p className="text-gray-600">Base: {base.title}</p>
        </div>
        <TableView 
          tableId={params.tableId}
          initialData={initialData}
          initialColumns={initialColumns}
        />
      </main>
    </>
  );
}