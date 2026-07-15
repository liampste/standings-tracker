export default function VerifyPage() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md text-center">
                <h1 className="text-2xl font-bold text-gray-900 mb-4">
                    Check your email
                </h1>
                <p className="text-gray-600 mb-4">
                    Please check your email and click the link to activate your account.
                </p>
                <p className="text-sm text-gray-500">
                    Already verified?{' '}
                    <a href="/login" className="text-blue-600 hover:underline">
                        Sign in
                    </a>
                </p>
            </div>
        </div>
    )
}
