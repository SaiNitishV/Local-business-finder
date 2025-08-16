# Local-business-finder
Local Business finder
Setup Instructions
Follow these steps to get your local development environment set up and running.

1. Create the React Project
If you haven't already, create a new React project using Vite.

# Create the project folder
npm create vite@latest my-lead-finder-app -- --template react
Note: Check for npm installation using commands: npm -v or node -v

# Navigate into the new folder
cd my-lead-finder-app

When prompted to select a variant, choose JavaScript or TypeScript.

2. Install Dependencies
Install the necessary firebase library.

npm install firebase

3. Set Up Your Firebase Project
Go to the Firebase Console and click "Create a project".

Follow the on-screen instructions to create your new project.

Once the project is created, enable the following services:

Authentication:
We need Authentication to give each user a private account
Go to the Authentication section.

Click "Get started".

Select the "Sign-in method" tab.

Click on Anonymous and enable it.

Firestore Database:
We need Firestore to store their personal list of saved leads in the cloud
Go to the Firestore Database section.

Click "Create database".

Choose to start in Test mode (this is crucial for development).

Select a server location and click Enable.

4. Configure Environment Variables
In your Firebase project, go to Project Settings (click the gear icon ⚙️) and scroll down to the "Your apps" card.

Click the Web icon (</>) to register a new web app.

Give it a nickname and click "Register app".

Firebase will display a firebaseConfig object. You will need these keys.

In your VS Code project, create a new file in the root directory called .env.local.

Copy and paste the following into .env.local, replacing the placeholder values with your actual keys from the Firebase Console:

VITE_FIREBASE_API_KEY="YOUR_API_KEY"
VITE_FIREBASE_AUTH_DOMAIN="YOUR_AUTH_DOMAIN"
VITE_FIREBASE_PROJECT_ID="YOUR_PROJECT_ID"
VITE_FIREBASE_STORAGE_BUCKET="YOUR_STORAGE_BUCKET"
VITE_FIREBASE_MESSAGING_SENDER_ID="YOUR_MESSAGING_SENDER_ID"
VITE_FIREBASE_APP_ID="YOUR_APP_ID"
Add the Application Code
Replace the entire content of src/App.tsx (or src/App.jsx) with the code provided in the local_business_finder_react_firebase document.

Running the Application
Make sure you are in the project's root directory in your terminal.

Run the development server:

npm run dev