import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — COR Perfusion AI",
  description: "Terms of service for COR, an AI assistant for cardiovascular perfusionists.",
};

export default function TermsPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#080b12",
        color: "#e5e7eb",
        padding: "48px 24px",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif",
      }}
    >
      <article style={{ maxWidth: 720, margin: "0 auto", lineHeight: 1.6 }}>
        <h1 style={{ color: "#e63946", marginBottom: 8 }}>Terms of Service</h1>
        <p style={{ color: "#9ca3af", marginTop: 0 }}>Effective date: May 14, 2026</p>

        <h2>1. Acceptance</h2>
        <p>
          By creating an account or using COR Perfusion AI (&ldquo;COR&rdquo;), you agree to these
          Terms of Service. If you do not agree, do not use the service.
        </p>

        <h2>2. Description of the service</h2>
        <p>
          COR is an AI-powered reference tool for cardiovascular perfusionists. It provides
          conversational responses, allows you to save reference material (protocols, case notes,
          equipment), and offers scheduling and inventory tools. COR is delivered as a web
          application and as an iOS application.
        </p>

        <h2>3. Not a medical device</h2>
        <p>
          COR is an educational and reference tool only. COR is <strong>not</strong> a medical
          device, has <strong>not</strong> been evaluated by the FDA or any other regulatory body,
          and is <strong>not</strong> intended for clinical decision-making, diagnosis, or
          treatment. Information provided by COR may be incomplete or inaccurate. You are solely
          responsible for clinical judgment and patient care.
        </p>

        <h2>4. No PHI</h2>
        <p>
          COR is <strong>not HIPAA-compliant</strong>. You agree not to enter any patient-identifying
          information into COR, including but not limited to: names, dates of birth, medical record
          numbers, addresses, social security numbers, or any other Protected Health Information as
          defined under HIPAA.
        </p>

        <h2>5. Accounts</h2>
        <p>
          You are responsible for maintaining the confidentiality of your account credentials and
          for all activity that occurs under your account. You agree to provide accurate registration
          information and to notify us promptly of any unauthorized access.
        </p>

        <h2>6. Acceptable use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Use COR to violate any applicable law or regulation.</li>
          <li>Attempt to gain unauthorized access to other accounts or to our systems.</li>
          <li>Reverse engineer, scrape, or use automated means to access the service in bulk.</li>
          <li>Upload malicious content or content that infringes the rights of others.</li>
          <li>Use COR to make clinical decisions about real patients.</li>
        </ul>

        <h2>7. Intellectual property</h2>
        <p>
          The COR application, branding, and original content remain the property of Clifton
          Marschel. You retain ownership of content you create within your account (logbook
          entries, conversations). You grant us a limited license to store and process your content
          solely to provide the service to you.
        </p>

        <h2>8. Termination</h2>
        <p>
          You may delete your account at any time by contacting us. We may suspend or terminate
          accounts that violate these terms or that pose a risk to other users or to the integrity
          of the service.
        </p>

        <h2>9. Disclaimer of warranties</h2>
        <p>
          COR is provided &ldquo;as is&rdquo; and &ldquo;as available,&rdquo; without warranties of
          any kind, express or implied. We do not warrant that COR will be uninterrupted,
          error-free, or that the responses generated will be accurate or fit for any particular
          purpose.
        </p>

        <h2>10. Limitation of liability</h2>
        <p>
          To the maximum extent permitted by law, we will not be liable for any indirect,
          incidental, special, consequential, or punitive damages, or any loss of data, revenue, or
          profits, arising out of or related to your use of COR.
        </p>

        <h2>11. Changes to these terms</h2>
        <p>
          We may update these terms from time to time. The effective date at the top of this page
          indicates when this version was published. Continued use of COR after changes constitutes
          acceptance of the updated terms.
        </p>

        <h2>12. Governing law</h2>
        <p>
          These terms are governed by the laws of the United States and the state in which the
          service operator resides, without regard to conflict of laws principles.
        </p>

        <h2>13. Contact</h2>
        <p>
          Questions about these terms can be sent to:{" "}
          <a href="mailto:cliftonmarschel@gmail.com" style={{ color: "#e63946" }}>
            cliftonmarschel@gmail.com
          </a>
          .
        </p>
      </article>
    </main>
  );
}
