import React, { useState } from "react";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, Timestamp } from "firebase/firestore";

// -----------------------
// Firebase Initialization
// -----------------------
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// -----------------------
// Types
// -----------------------
interface Business {
  id?: string;
  apiId: string;
  name: string;
  phone: string;
  address: string;
  website: string;
}

type SearchState = "idle" | "loading" | "success" | "error";

// -----------------------
// Load Google Maps SDK
// -----------------------
const loadGoogleMapsSDK = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if ((window as any).google) return resolve();

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${import.meta.env.VITE_GOOGLE_PLACES_API_KEY}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google Maps SDK failed to load"));
    document.head.appendChild(script);
  });
};

// -----------------------
// Main Component
// -----------------------
const App: React.FC = () => {
  const [searchParams, setSearchParams] = useState({ businessType: "", location: "" });
  const [searchResults, setSearchResults] = useState<Business[]>([]);
  const [searchState, setSearchState] = useState<SearchState>("idle");

  // -----------------------
  // Save Lead to Firestore
  // -----------------------
  const saveLead = async (business: Business) => {
    try {
      await addDoc(collection(db, "leads"), { ...business, timestamp: Timestamp.now() });
      alert("Lead saved successfully!");
    } catch (error) {
      console.error("Error saving lead:", error);
      alert("Failed to save lead.");
    }
  };

  // -----------------------
  // Handle Search
  // -----------------------
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchParams.businessType || !searchParams.location) return;

    setSearchState("loading");

    try {
      await loadGoogleMapsSDK();
      if (!window.google || !window.google.maps) {
        setSearchState("error");
        return;
      }

      const map = new google.maps.Map(document.createElement("div")); // hidden map
      const service = new google.maps.places.PlacesService(map);

      const request = {
        query: `${searchParams.businessType} in ${searchParams.location}`,
        fields: ["name", "formatted_address", "formatted_phone_number", "website", "place_id"],
      };

      service.textSearch(request, (results, status) => {
        if (status !== google.maps.places.PlacesServiceStatus.OK || !results) {
          setSearchState("error");
          return;
        }

        const businesses = results.slice(0, 100).map((place) => ({
          apiId: place.place_id!,
          name: place.name!,
          phone: (place as any).formatted_phone_number || "N/A",
          address: place.formatted_address || "N/A",
          website: (place as any).website || "N/A",
        }));

        setSearchResults(businesses);
        setSearchState("success");
      });
    } catch (err) {
      console.error(err);
      setSearchState("error");
    }
  };

  // -----------------------
  // Render
  // -----------------------
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold mb-8 text-center text-gray-800">
          Local Business Finder
        </h1>

        {/* Search Form */}
        <form
          onSubmit={handleSearch}
          className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8"
        >
          <input
            type="text"
            placeholder="Business Type (e.g., Restaurant)"
            value={searchParams.businessType}
            onChange={(e) =>
              setSearchParams({ ...searchParams, businessType: e.target.value })
            }
            className="p-3 rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="text"
            placeholder="Location (e.g., New York, NY)"
            value={searchParams.location}
            onChange={(e) =>
              setSearchParams({ ...searchParams, location: e.target.value })
            }
            className="p-3 rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded p-3 transition"
          >
            Search
          </button>
        </form>

        {searchState === "loading" && (
          <p className="text-center text-gray-600 mb-4">Searching businesses...</p>
        )}
        {searchState === "error" && (
          <p className="text-center text-red-500 mb-4">No businesses found or API error.</p>
        )}

        {searchResults.length > 0 && (
          <div className="overflow-x-auto bg-white rounded shadow">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-700 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-700 uppercase tracking-wider">
                    Address
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-700 uppercase tracking-wider">
                    Phone
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-700 uppercase tracking-wider">
                    Website
                  </th>
                  <th className="px-6 py-3 text-center text-sm font-medium text-gray-700 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {searchResults.map((business) => (
                  <tr key={business.apiId} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-gray-800 font-medium">
                      {business.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                      {business.address}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                      {business.phone}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-blue-600">
                      {business.website !== "N/A" ? (
                        <a
                          href={business.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline"
                        >
                          {business.website}
                        </a>
                      ) : (
                        "No website"
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <button
                        onClick={() => saveLead(business)}
                        className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded transition"
                      >
                        Save Lead
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;