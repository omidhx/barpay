export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md w-full p-8 bg-zinc-50 dark:bg-zinc-900 rounded-2xl shadow-sm border border-zinc-200 dark:border-zinc-800">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-3">
          بارنامه‌پی (barnameh-pay)
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400 text-sm mb-6 leading-relaxed">
          سامانه یکپارچه مدیریت بارنامه، تعهدنامه الکترونیک و پرداخت رانندگان شرکت‌های حمل‌ونقل ایران.
        </p>
        <div className="flex flex-col gap-3">
          <a
            href="/login"
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl text-sm transition-colors"
          >
            ورود به پنل مدیریت
          </a>
        </div>
      </div>
    </main>
  );
}
