export default function HomePage() {
  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-4xl font-bold mb-6" data-testid="page-title">
        Welcome to Level.cre
      </h1>
      <div className="prose dark:prose-invert max-w-none">
        <p className="text-lg mb-4">
          This is a modern full-stack web application built with React, Express, and TypeScript.
        </p>
        <div className="grid md:grid-cols-2 gap-6 mt-8">
          <div className="bg-gray-50 dark:bg-gray-900 p-6 rounded-lg">
            <h2 className="text-xl font-semibold mb-3">Features</h2>
            <ul className="space-y-2">
              <li>• Modern React frontend with TypeScript</li>
              <li>• Express.js backend API</li>
              <li>• In-memory data storage</li>
              <li>• Responsive design with Tailwind CSS</li>
              <li>• Dark mode support</li>
            </ul>
          </div>
          <div className="bg-gray-50 dark:bg-gray-900 p-6 rounded-lg">
            <h2 className="text-xl font-semibold mb-3">Get Started</h2>
            <p className="mb-4">Explore the user management features or customize the application to meet your needs.</p>
            <a 
              href="/users" 
              className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition-colors"
              data-testid="link-users"
            >
              View Users
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}