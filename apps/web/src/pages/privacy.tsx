import { useLocation } from 'wouter'

export default function PrivacyPolicy() {
  const [, setLocation] = useLocation()

  return (
    <div className="min-h-screen bg-white">
      <div className="container mx-auto px-4 md:px-6 lg:px-8 py-10 md:py-16 max-w-3xl">
        <div className="mb-6">
          <button
            onClick={() => setLocation('/')}
            className="text-sm text-slate-600 hover:text-slate-900 underline underline-offset-2"
            aria-label="Back to home"
          >
            ← Back to Home
          </button>
        </div>

        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-slate-900 mb-2">
          Privacy Policy for level CRE
        </h1>
        <p className="text-slate-500 text-sm mb-8">Last Updated: September 26, 2025</p>

        <div className="prose prose-slate max-w-none">
          <p>
            This Privacy Policy explains how we collect, use, disclose, and safeguard your
            information when you use our application.
          </p>

          <h2>1. Information We Collect</h2>
          <p>
            We may collect information including: Personal Data (from Google Sign-In), User-Generated
            Content (workspaces, prospects), and Derivative Data (analytics).
          </p>

          <h2>2. How We Use Your Information</h2>
          <p>
            We use information to create and manage your account, operate and maintain the Service,
            analyze usage to improve your experience, and respond to customer service requests.
          </p>

          <h2>3. Disclosure of Your Information</h2>
          <p>
            We do not sell your personal information. We may share information with third-party service
            providers (e.g., Google, Supabase) who perform services for us under strict data protection
            terms, or if required by law.
          </p>

          <h2>4. Security of Your Information</h2>
          <p>
            We use commercially reasonable measures to protect your information. However, no security
            measures are perfect or impenetrable, and no method of data transmission can be guaranteed
            against misuse.
          </p>

          <h2>5. Cookies and Tracking Technologies</h2>
          <p>
            We may use cookies and similar tracking technologies to help customize the Service and improve
            your experience. The types of cookies we use include:
          </p>
          <ul>
            <li><strong>Essential Cookies:</strong> Strictly necessary for providing the Service, such as keeping you logged in.</li>
            <li><strong>Analytics Cookies:</strong> To help us understand how our Service is being used so we can improve it.</li>
            <li><strong>Third-Party Cookies:</strong> From services like Google Maps to enable core functionality.</li>
          </ul>
          <p>You can typically manage cookie preferences through your browser settings.</p>

          <h2>6. Contact Us</h2>
          <p>
            If you have questions or comments about this Privacy Policy, please contact us at: [Your Contact Email]
          </p>
        </div>
      </div>
    </div>
  )
}

