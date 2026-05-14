import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — COR Perfusion AI",
  description: "Privacy policy for COR, an AI assistant for cardiovascular perfusionists.",
};

export default function PrivacyPage() {
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
        <h1 style={{ color: "#e63946", marginBottom: 8 }}>Privacy Policy</h1>
        <p style={{ color: "#9ca3af", marginTop: 0 }}>Effective date: May 14, 2026</p>

        <h2>1. Who we are</h2>
        <p>
          COR Perfusion AI (&ldquo;COR,&rdquo; &ldquo;we,&rdquo; &ldquo;our&rdquo;) is an AI assistant
          designed for cardiovascular perfusionists. COR is operated by Clifton Marschel and is
          available at perfusion-bot.vercel.app and as an iOS application.
        </p>

        <h2>2. Information we collect</h2>
        <ul>
          <li>
            <strong>Account information:</strong> the email address and password you use to sign in.
          </li>
          <li>
            <strong>Conversations:</strong> the messages you send to COR and the responses generated.
            By default conversations are retained for 7 days; conversations you pin are retained until
            you delete them.
          </li>
          <li>
            <strong>Logbook entries:</strong> protocols, case notes, equipment, and other knowledge
            you save. These are retained until you delete them.
          </li>
          <li>
            <strong>Schedule and inventory data:</strong> any case schedule, equipment inventory, or
            time-off requests you enter.
          </li>
          <li>
            <strong>Voice input:</strong> when you use voice input, your speech is processed by your
            device&apos;s operating system and transmitted as text. COR does not store audio
            recordings.
          </li>
          <li>
            <strong>Uploaded files:</strong> any images, documents, or other files you attach are
            processed to generate responses and may be retained as part of your conversation history.
          </li>
        </ul>

        <h2>3. How we use your information</h2>
        <p>
          We use your information to provide and operate COR, including: authenticating you,
          generating AI responses to your questions, retrieving relevant context from your saved
          knowledge, and improving the quality of the service.
        </p>

        <h2>4. Third-party services</h2>
        <p>COR is built on the following third-party services, each with their own privacy policies:</p>
        <ul>
          <li>
            <strong>Supabase</strong> &mdash; database and authentication. Your account, conversations,
            and logbook are stored on Supabase infrastructure.
          </li>
          <li>
            <strong>Anthropic</strong> &mdash; language model. Your messages are sent to Anthropic&apos;s
            Claude API to generate responses. Anthropic does not train on API data.
          </li>
          <li>
            <strong>OpenAI</strong> &mdash; embedding model. Your messages are converted into numeric
            embeddings via OpenAI&apos;s embedding API to retrieve relevant knowledge from your
            account. OpenAI does not train on API data.
          </li>
          <li>
            <strong>Vercel</strong> &mdash; hosting. The COR web application is hosted on Vercel.
          </li>
        </ul>

        <h2>5. Clinical use disclaimer</h2>
        <p>
          COR is an educational and reference tool. It is <strong>not</strong> a medical device, has
          not been reviewed by the FDA or any other regulatory body, and is <strong>not</strong>{" "}
          intended for clinical decision-making, diagnosis, or treatment. COR is{" "}
          <strong>not HIPAA-compliant</strong>. Do not enter patient-identifying information (names,
          MRNs, dates of birth, or any other PHI) into COR.
        </p>

        <h2>6. Data security</h2>
        <p>
          All data in transit is encrypted via HTTPS/TLS. Account passwords are hashed and never
          stored in plain text. We follow industry-standard practices to protect your data, but no
          system is perfectly secure.
        </p>

        <h2>7. Your rights</h2>
        <p>You can at any time:</p>
        <ul>
          <li>Delete individual conversations or logbook entries from within the app.</li>
          <li>Request deletion of your entire account by emailing the address below.</li>
          <li>Request a copy of the data we hold about you.</li>
        </ul>

        <h2>8. Children</h2>
        <p>COR is intended for licensed healthcare professionals and is not directed at children under 18.</p>

        <h2>9. Changes to this policy</h2>
        <p>
          We may update this policy from time to time. The effective date at the top of this page
          indicates when this version was published.
        </p>

        <h2>10. Contact</h2>
        <p>
          Questions or requests can be sent to:{" "}
          <a href="mailto:cliftonmarschel@gmail.com" style={{ color: "#e63946" }}>
            cliftonmarschel@gmail.com
          </a>
          .
        </p>
      </article>
    </main>
  );
}
