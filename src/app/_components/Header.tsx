import {auth} from "~/server/auth";
import Link from "next/link";
import { Button } from "~/components/ui/button";

export async function Header(){
  const session = await auth();
  
  return (

      <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">{session?.user?.name? `Welcome ${session.user.name}` : "Airtable"}</h1>
        <Link
              href={session ? "/api/auth/signout" : "/api/auth/signin?callbackUrl=/dashboard"}
            >
          <Button variant="secondary" size="sm">
            {session ? "Sign out" : "Sign in"}
          </Button>
        </Link>
      </div>
  )
}