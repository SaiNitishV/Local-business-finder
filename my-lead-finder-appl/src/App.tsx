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
// Main App Component
// -----------------------
const App: React.FC = () => {
  const [searchParams, setSearchParams] = useState({ businessType: "", location: "" });
  const [searchResults, setSearchResults] = useState<Business[]>([]);
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [currentPage, setCurrentPage] = useState(1);

  const resultsPerPage = 20;
  const totalPages = Math.ceil(searchResults.length / resultsPerPage);

  const indexOfLastResult = currentPage * resultsPerPage;
  const indexOfFirstResult = indexOfLastResult - resultsPerPage;
  const currentResults = searchResults.slice(indexOfFirstResult, indexOfLastResult);

  // -----------------------
  // Handle Search
  // -----------------------
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchParams.businessType || !searchParams.location) return;

    setSearchState("loading");
    setCurrentPage(1); // reset to first page on new search

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
      };

      let allResults: google.maps.places.PlaceResult[] = [];

      // Recursive pagination fetcher
      const fetchPage = (req: typeof request): Promise<void> => {
        return new Promise((resolve, reject) => {
          service.textSearch(req, (results, status, pagination) => {
            if (status !== google.maps.places.PlacesServiceStatus.OK || !results) {
              reject(new Error("Search failed"));
              return;
            }

            allResults = [...allResults, ...results];

            if (pagination && pagination.hasNextPage) {
              // Google requires a 2s delay before fetching next page
              setTimeout(() => {
                pagination.nextPage();
              }, 2000);

              // keep waiting until nextPage triggers again
              const checkNext = () => {
                if (!pagination.hasNextPage) {
                  resolve();
                } else {
                  setTimeout(checkNext, 500);
                }
              };
              checkNext();
            } else {
              resolve();
            }
          });
        });
      };

      await fetchPage(request);

      // Transform results into your Business type
      const businesses: Business[] = allResults.map((place) => ({
        apiId: place.place_id!,
        name: place.name!,
        phone: (place as any).formatted_phone_number || "N/A",
        address: place.formatted_address || "N/A",
        website: (place as any).website || "N/A",
        contacted: false,
      }));

      // Check Firestore for previously contacted leads
      const leadsQuery = query(
        collection(db, "leads"),
        where("businessType", "==", searchParams.businessType),
        where("location", "==", searchParams.location)
      );
      const querySnapshot = await getDocs(leadsQuery);
      const contactedApiIds = new Set(querySnapshot.docs.map((doc) => doc.data().apiId));

      const updatedBusinesses = businesses.map((b) => ({
        ...b,
        contacted: contactedApiIds.has(b.apiId),
      }));

      setSearchResults(updatedBusinesses);
      setSearchState("success");
    } catch (err) {
      console.error(err);
      setSearchState("error");
    }
  };

  // -----------------------
  // Handle Contacted Checkbox
  // -----------------------
  const handleCheckboxChange = async (globalIndex: number) => {
    const updatedResults = [...searchResults];
    updatedResults[globalIndex].contacted = !updatedResults[globalIndex].contacted;
    setSearchResults(updatedResults);

    if (updatedResults[globalIndex].contacted) {
      const confirmSave = window.confirm(
        `Do you want to save ${updatedResults[globalIndex].name} as contacted?`
      );
      if (confirmSave) {
        try {
          await addDoc(collection(db, "leads"), {
            ...updatedResults[globalIndex],
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
        updatedResults[globalIndex].contacted = false;
        setSearchResults(updatedResults);
      }
    }
  };

  // -----------------------
  // Render
  // -----------------------
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center">
      {/* Heading */}
      <header className="text-center py-12">
        <h1 className="text-5xl font-bold">Local Business Finder</h1>
      </header>

      {/* Centered Search Form */}
      <form
        onSubmit={handleSearch}
        className="w-full max-w-4xl bg-white p-8 rounded shadow grid grid-cols-1 md:grid-cols-3 gap-6 mt-12"
      >
        <div>
          <label htmlFor="businessType" className="block mb-1 font-medium">
            Business Type
          </label>
          <input
            id="businessType"
            className="border p-3 rounded w-full"
            value={searchParams.businessType}
            onChange={(e) =>
              setSearchParams({ ...searchParams, businessType: e.target.value })
            }
            placeholder="e.g., Restaurant, Salon"
          />
        </div>
        <div>
          <label htmlFor="location" className="block mb-2 font-medium">
            Location
          </label>
          <input
            id="location"
            className="border p-3 rounded w-full"
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
            className="bg-blue-600 text-white px-6 py-3 rounded w-full hover:bg-blue-700"
          >
            Search
          </button>
        </div>
      </form>

      {/* Search Results */}
      <div className="w-full max-w-6xl mt-12 px-4">
        {searchState === "loading" && <p>Searching businesses...</p>}
        {searchState === "error" && (
          <p className="text-red-500">No businesses found. Try again.</p>
        )}

        {searchState === "success" && searchResults.length > 0 && (
          <>
            <div className="overflow-x-auto w-full max-w-6xl mx-auto mt-12 px-4">
              <table className="min-w-full bg-white rounded shadow text-left">
                <thead className="bg-gray-200">
                  <tr>
                    <th className="py-2 px-4 text-left">#</th>
                    <th className="py-2 px-4">Name</th>
                    <th className="py-2 px-4">Address</th>
                    <th className="py-2 px-4">Phone</th>
                    <th className="py-2 px-4">Website</th>
                    <th className="py-2 px-4 text-center">Contacted</th>
                  </tr>
                </thead>
                <tbody>
                  {currentResults.map((b, i) => (
                    <tr
                      key={b.apiId}
                      className={i % 2 === 0 ? "bg-gray-50 border-b" : "bg-white border-b"}
                    >
                      <td className="py-2 px-4">{indexOfFirstResult + i + 1}</td>
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
                          onChange={() =>
                            handleCheckboxChange(indexOfFirstResult + i)
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex justify-center items-center gap-4 mt-4">
              <button
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400 disabled:opacity-50"
              >
                Previous
              </button>
              <span>
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default App;
