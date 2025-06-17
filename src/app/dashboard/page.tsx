import { auth } from "~/server/auth";
import { api } from "~/trpc/server";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Header } from "~/app/_components/Header"; // Adjust import path as needed
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Trash2 } from "lucide-react";
import Link from "next/link";

export default async function Dashboard() {
  const session = await auth();

  if (!session) {
    redirect("/api/auth/signin?callbackUrl=/dashboard");
  }

  const bases = await api.base.getAllBasesByUser();

  return (
    <>
      <Header />
      <main className="max-w-3xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold mb-4">Your Bases</h1>

        <form
          action={async (formData) => {
            "use server";
            const name = formData.get("baseName")?.toString();
            if (name && name.trim()) {
              await api.base.createBase({ name });
              revalidatePath("/dashboard");
            }
          }}
          className="flex gap-2 mb-6"
        >
          <Input name="baseName" placeholder="Enter base name" />
          <Button type="submit">Create Base</Button>
        </form>

        {bases.length === 0 ? (
          <div>No bases found. Create one to get started!</div>
        ) : (
          <ul className="space-y-2">
            {bases.map((base) => (

              <li key={base.id} className="flex justify-between border p-3 rounded-md hover:bg-gray-100 transition">
                      <Link href={`/dashboard/${base.id}`} className="flex-1 font-semibold hover:underline">
                        {base.title}
                      </Link>

              <form action={async () => {
                  "use server";
                  await api.base.deleteBase({ baseId: base.id });
                  revalidatePath("/dashboard");
                }}
              >
                <button type="submit" className="hover:opacity-70 text-sm text-red-600 hover:underline">
                  <Trash2/>
                </button>
              </form>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}