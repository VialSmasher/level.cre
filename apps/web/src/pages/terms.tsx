import { useLocation } from 'wouter'

export default function TermsOfService() {
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
          Terms of Service for level CRE
        </h1>
        <p className="text-slate-500 text-sm mb-8">Last Updated: September 26, 2025</p>

        <div className="prose prose-slate max-w-none">
          <p>
            Please read these Terms of Service carefully. Your access to and use of the Service is
            conditioned upon your acceptance of and compliance with these Terms.
          </p>

          <h2>1. Acceptance of Terms</h2>
          <p>
            By accessing or using the Service, you agree to be bound by these Terms.
          </p>

          <h2>2. Accounts</h2>
          <p>
            You are responsible for safeguarding your account and for all activities that occur under it.
          </p>

          <h2>3. Your Content and Data Ownership</h2>
          <p>
            You retain all ownership rights to the User Content you create or upload to the Service. “User Content”
            includes all information, data, and materials you submit. By using the Service, you grant level CRE a
            limited, non-exclusive, worldwide license to use, store, display, and distribute your User Content solely
            for the purpose of operating, providing, and improving the Service for you.
          </p>

          <h2>4. Acceptable Use</h2>
          <p>You agree not to use the Service to:</p>
          <ul>
            <li>Upload or transmit any content that is unlawful or infringes on any third-party rights.</li>
            <li>Engage in any activity that interferes with or disrupts the Service, its servers, or networks.</li>
            <li>Attempt to gain unauthorized access to any portion of the Service.</li>
            <li>Use the Service for sending unsolicited communications or spam.</li>
          </ul>

          <h2>5. Disclaimer of Warranties</h2>
          <p>
            Your use of the Service is at your sole risk. The Service is provided on an “AS IS” and “AS AVAILABLE”
            basis, without warranties of any kind, whether express or implied.
          </p>

          <h2>6. Limitation of Liability</h2>
          <p>
            In no event shall level CRE be liable for any indirect, incidental, special, consequential, or punitive
            damages, including damages resulting from the loss or unauthorized disclosure of your User Content.
          </p>

          <h2>7. Governing Law</h2>
          <p>
            These Terms shall be governed by the laws of the Province of Alberta, Canada.
          </p>

          <h2>8. Changes</h2>
          <p>
            We reserve the right to modify or replace these Terms at any time.
          </p>

          <h2>9. Contact Us</h2>
          <p>
            If you have any questions about these Terms, please contact us at: [Your Contact Email]
          </p>
        </div>
      </div>
    </div>
  )
}
