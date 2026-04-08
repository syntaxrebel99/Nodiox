import { Link } from "@nodiox/i18n"
import { ShimmerButton } from "@nodiox/ui"
import Image from "next/image"

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 text-center py-10">
      <div className="relative mb-2 flex h-16 w-16 items-center justify-center">
        <Image
          src="https://fonts.gstatic.com/s/e/notoemoji/latest/1f9d4/512.webp"
          alt="🧐"
          width={64}
          height={64}
          unoptimized
        />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Page Not Found</h1>
        <p className="text-muted-foreground max-w-sm text-balance text-sm">
          We couldn't find the authentication page you were looking for. 
          It might have been moved or doesn't exist.
        </p>
      </div>
      <Link href="/login" tabIndex={-1}>
        <ShimmerButton className="mt-4 min-w-[200px]">
          Back to Login
        </ShimmerButton>
      </Link>
    </div>
  )
}
