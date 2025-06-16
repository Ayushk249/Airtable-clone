
import {auth} from "~/server/auth";
import Link from "next/link";

export async function Header(){

  const session = await auth();
  return (
    <div className="flex  bg-pink-800 text-yellow-100">
        <div className="flex-1 pl-5 text-3xl font-bold">
            {session?.user?.name? `Welcome ${session.user.name}` : "Welcome Guest"}
        </div>
                 <div className="flex flex-col items-center justify-center gap-4">
              <Link
                href={session ? "/api/auth/signout" : "/api/auth/signin"}
                className="rounded-full bg-white/10 px-10 py-3 font-semibold no-underline transition hover:bg-white/20"
              >
                {session ? "Sign out" : "Sign in"}
              </Link>
            </div>
    </div>
  )
}

