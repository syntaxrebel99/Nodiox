export default async function StorefrontPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  
  return (
    <div className="min-h-screen bg-white text-neutral-900 font-sans">
      <header className="border-b border-neutral-200 py-6 px-8 flex items-center justify-between">
        <div className="text-2xl font-bold tracking-tight capitalize">{tenant}</div>
        <nav className="space-x-8 text-sm font-medium text-neutral-500">
          <span>Products</span>
          <span>Categories</span>
          <span>About Us</span>
        </nav>
      </header>
      <main className="p-8">
        <h1 className="text-4xl font-semibold tracking-tight mb-4">Welcome to {tenant}</h1>
        <p className="text-neutral-500">This is a dynamic template rendered via Next.js multi-tenant middleware.</p>
      </main>
    </div>
  );
}
