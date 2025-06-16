import Link from "next/link";

import { LatestPost } from "~/app/_components/post";
import { auth } from "~/server/auth";
import { api, HydrateClient } from "~/trpc/server";
import { Header } from "./_components/Header";

export default async function Home() {
  const hello = await api.post.hello({ text: "from tRPC"});
  const session = await auth();
  if (session?.user) {
    void api.post.getLatest.prefetch();

  }
 
      const data= await api.base.getAll();
      console.log("data", data);
    

  return (
    <>
      {/* <head>
        <title>Airtable</title>
        <meta name="description" content="A simple example of Next.js with tRPC" />
        <link rel="icon" href="/favicon.ico" />
      </head> */}
      <main>
        <Header />
          
          <div className="flex items-center p-4">
            {session?.user &&data?.map((item) => (
              <div key={item.id} className="p-4">
                  {item.title}
              </div>
            
            ))}
          </div>

      </main>
    </>

  );
}
