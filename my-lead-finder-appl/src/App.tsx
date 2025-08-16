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
    if ((window as any).google) {
      resolve();
      return;
    }

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
      await addDoc(collection(db, "leads"), {
        ...business,
        timestamp: Timestamp.now(),
      });
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
        console.error("Google Maps SDK not loaded");
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
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Local Business Finder</h1>

      {/* Search Form */}
      <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div>
          <label htmlFor="businessType" className="block mb-1 font-medium">
            Business Type
          </label>
          <input
            id="businessType"
            className="border p-2 rounded w-full"
            value={searchParams.businessType}
            onChange={(e) => setSearchParams({ ...searchParams, businessType: e.target.value })}
            placeholder="e.g., Restaurant, Salon"
          />
        </div>
        <div>
          <label htmlFor="location" className="block mb-1 font-medium">
            Location
          </label>
          <input
            id="location"
            className="border p-2 rounded w-full"
            value={searchParams.location}
            onChange={(e) => setSearchParams({ ...searchParams, location: e.target.value })}
            placeholder="e.g., New York, NY"
          />
        </div>
        <div className="flex items-end">
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded w-full">
            Search
          </button>
        </div>
      </form>

      {/* Search Results */}
      {searchState === "loading" && <p>Searching businesses...</p>}
      {searchState === "error" && <p className="text-red-500">No businesses found. Try again.</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {searchResults.map((business) => (
          <div key={business.apiId} className="border p-4 rounded-lg shadow">
            <h2 className="text-xl font-semibold">{business.name}</h2>
            <p>{business.address}</p>
            <p>{business.phone}</p>
            {business.website !== "N/A" ? (
              <a href={business.website} target="_blank" rel="noopener noreferrer" className="text-blue-600">
                {business.website}
              </a>
            ) : (
              <p className="text-gray-500">No website</p>
            )}
            <button
              className="mt-3 bg-green-600 text-white px-3 py-1 rounded"
              onClick={() => saveLead(business)}
            >
              Save Lead
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default App;