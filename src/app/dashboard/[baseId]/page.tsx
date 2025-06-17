import { notFound } from "next/navigation";
import { auth } from "~/server/auth";
import { api } from "~/trpc/server";
import { Header } from "~/app/_components/Header";
import { TableManager } from "./tableManager";

interface PageProps {
  params: {
    baseId: string;
  };
}

export default async function BasePage({ params }: PageProps) {
  const session = await auth();
  if (!session) notFound();

  const base = await api.base.getById({ id: params.baseId });
  if (!base || base.userId !== session.user.id) notFound();

  const initialTables = await api.table.getAllByBase({ baseId: params.baseId });

  return (
    <>
      <Header />
      <main className="max-w-3xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold mb-4">{base.title}</h1>
        <TableManager baseId={params.baseId} initialTables={initialTables} />
      </main>
    </>
  );
}