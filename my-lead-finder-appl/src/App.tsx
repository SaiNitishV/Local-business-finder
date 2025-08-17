import React, { useState } from "react";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  addDoc,
  query,
  where,
  getDocs,
  Timestamp,
} from "firebase/firestore";

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
  apiId: string;
  name: string;
  phone: string;
  address: string;
  website: string;
  contacted?: boolean;
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

      service.textSearch(request, async (results, status) => {
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
          contacted: false,
        }));

        // -----------------------
        // Check Firestore for previously contacted leads
        // -----------------------
        const leadsQuery = query(
          collection(db, "leads"),
          where("businessType", "==", searchParams.businessType),
          where("location", "==", searchParams.location)
        );
        const querySnapshot = await getDocs(leadsQuery);

        const contactedApiIds = new Set(
          querySnapshot.docs.map((doc) => doc.data().apiId)
        );

        const updatedBusinesses = businesses.map((b) => ({
          ...b,
          contacted: contactedApiIds.has(b.apiId),
        }));

        setSearchResults(updatedBusinesses);
        setSearchState("success");
      });
    } catch (err) {
      console.error(err);
      setSearchState("error");
    }
  };

  // -----------------------
  // Handle Contacted Checkbox
  // -----------------------
  const handleCheckboxChange = async (index: number) => {
    const updatedResults = [...searchResults];
    updatedResults[index].contacted = !updatedResults[index].contacted;
    setSearchResults(updatedResults);

    if (updatedResults[index].contacted) {
      const confirmSave = window.confirm(
        `Do you want to save ${updatedResults[index].name} as contacted?`
      );
      if (confirmSave) {
        try {
          await addDoc(collection(db, "leads"), {
            ...updatedResults[index],
            businessType: searchParams.businessType,
            location: searchParams.location,
            contacted: true,
            timestamp: Timestamp.now(),
          });
          alert("Lead saved successfully!");
        } catch (error) {
          console.error("Error saving lead:", error);
          alert("Failed to save lead.");
        }
      } else {
        // Revert checkbox if user cancels
        updatedResults[index].contacted = false;
        setSearchResults(updatedResults);
      }
    }
  };

  // -----------------------
  // Render
  // -----------------------
  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6 text-center">Local Business Finder</h1>

      {/* Search Form */}
      <form
        onSubmit={handleSearch}
        className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 bg-white p-6 rounded shadow"
      >
        <div>
          <label htmlFor="businessType" className="block mb-1 font-medium">
            Business Type
          </label>
          <input
            id="businessType"
            className="border p-2 rounded w-full"
            value={searchParams.businessType}
            onChange={(e) =>
              setSearchParams({ ...searchParams, businessType: e.target.value })
            }
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
            onChange={(e) =>
              setSearchParams({ ...searchParams, location: e.target.value })
            }
            placeholder="e.g., New York, NY"
          />
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            className="bg-blue-600 text-white px-4 py-2 rounded w-full hover:bg-blue-700"
          >
            Search
          </button>
        </div>
      </form>

      {/* Search Results */}
      {searchState === "loading" && <p>Searching businesses...</p>}
      {searchState === "error" && (
        <p className="text-red-500">No businesses found. Try again.</p>
      )}

      {searchState === "success" && searchResults.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white rounded shadow">
            <thead className="bg-gray-200">
              <tr>
                <th className="py-2 px-4 text-left">Name</th>
                <th className="py-2 px-4 text-left">Address</th>
                <th className="py-2 px-4 text-left">Phone</th>
                <th className="py-2 px-4 text-left">Website</th>
                <th className="py-2 px-4 text-center">Contacted</th>
              </tr>
            </thead>
            <tbody>
              {searchResults.map((b, i) => (
                <tr key={b.apiId} className="border-b">
                  <td className="py-2 px-4">{b.name}</td>
                  <td className="py-2 px-4">{b.address}</td>
                  <td className="py-2 px-4">{b.phone}</td>
                  <td className="py-2 px-4">
                    {b.website !== "N/A" ? (
                      <a
                        href={b.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        {b.website}
                      </a>
                    ) : (
                      "N/A"
                    )}
                  </td>
                  <td className="py-2 px-4 text-center">
                    <input
                      type="checkbox"
                      checked={b.contacted || false}
                      onChange={() => handleCheckboxChange(i)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default App;