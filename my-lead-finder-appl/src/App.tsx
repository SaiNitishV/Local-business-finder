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
  doc, // <-- Import `doc`
  deleteDoc, // <-- Import `deleteDoc`
} from "firebase/firestore";

// -----------------------
// Firebase Initialization (no changes)
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
// Types (no changes)
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
// Load Google Maps SDK (no changes)
// -----------------------
const loadGoogleMapsSDK = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if ((window as any).google) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${
      import.meta.env.VITE_GOOGLE_PLACES_API_KEY
    }&libraries=places`;
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
  // State and other functions (no changes here)
  const [searchParams, setSearchParams] = useState({
    businessType: "",
    location: "",
  });
  const [searchResults, setSearchResults] = useState<Business[]>([]);
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [currentPage, setCurrentPage] = useState(1);

  const resultsPerPage = 20;
  const totalPages = Math.ceil(searchResults.length / resultsPerPage);

  const indexOfLastResult = currentPage * resultsPerPage;
  const indexOfFirstResult = indexOfLastResult - resultsPerPage;
  const currentResults = searchResults.slice(
    indexOfFirstResult,
    indexOfLastResult
  );

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchParams.businessType || !searchParams.location) return;

    setSearchState("loading");
    setSearchResults([]); 
    setCurrentPage(1);

    try {
      await loadGoogleMapsSDK();
      if (!window.google || !window.google.maps) {
        console.error("Google Maps SDK not loaded");
        setSearchState("error");
        return;
      }

      const map = new google.maps.Map(document.createElement("div"));
      const service = new google.maps.places.PlacesService(map);
      
      const allResults: google.maps.places.PlaceResult[] = [];
      const fetchAllResults = (): Promise<void> => {
        return new Promise((resolve, reject) => {
          const request = {
            query: `${searchParams.businessType} in ${searchParams.location}`,
          };
          
          const callback = (
              results: google.maps.places.PlaceResult[] | null,
              status: google.maps.places.PlacesServiceStatus,
              pagination: google.maps.places.PlaceSearchPagination | null
          ) => {
              if (status === google.maps.places.PlacesServiceStatus.OK && results) {
                  allResults.push(...results);
              } else if (status !== google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
                  return reject(new Error(`Places search failed with status: ${status}`));
              }

              if (pagination && pagination.hasNextPage) {
                  setTimeout(() => {
                      pagination.nextPage();
                  }, 2000);
              } else {
                  resolve();
              }
          };
          
          service.textSearch(request, callback);
        });
      };
      
      await fetchAllResults();

      if (allResults.length === 0) {
        setSearchState("success");
        return;
      }

      const detailPromises = allResults.map((place) => {
        return new Promise<google.maps.places.PlaceResult | null>((resolve) => {
          if (!place.place_id) {
            return resolve(null);
          }
          const detailRequest = {
            placeId: place.place_id,
            fields: [
              "name",
              "place_id",
              "formatted_address",
              "formatted_phone_number",
              "website",
            ],
          };
          service.getDetails(detailRequest, (placeDetails, status) => {
            if (status === google.maps.places.PlacesServiceStatus.OK) {
              resolve(placeDetails);
            } else {
              resolve(place);
            }
          });
        });
      });

      const detailedResults = await Promise.all(detailPromises);

      const businesses: Business[] = detailedResults
        .filter((place): place is google.maps.places.PlaceResult => place !== null)
        .map((place) => ({
          apiId: place.place_id!,
          name: place.name!,
          phone: place.formatted_phone_number || "N/A",
          address: place.formatted_address || "N/A",
          website: place.website || "N/A",
          contacted: false,
        }));

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
    } catch (err) {
      console.error(err);
      setSearchState("error");
    }
  };

  // -----------------------
  // Handle Contacted Checkbox -- LOGIC UPDATED HERE
  // -----------------------
  const handleCheckboxChange = async (globalIndex: number) => {
    const originalResults = [...searchResults];
    const targetBusiness = originalResults[globalIndex];
    const isNowChecked = !targetBusiness.contacted; // The state we are moving to

    // Optimistically update the UI for a responsive feel
    const optimisticResults = originalResults.map((business, index) => {
        if (index === globalIndex) {
            return { ...business, contacted: isNowChecked };
        }
        return business;
    });
    setSearchResults(optimisticResults);


    if (isNowChecked) {
      // --- This is the LOGIC FOR CHECKING a box ---
      const confirmSave = window.confirm(
        `Do you want to save ${targetBusiness.name} as contacted?`
      );
      if (confirmSave) {
        try {
          await addDoc(collection(db, "leads"), {
            ...targetBusiness,
            contacted: true, // ensure it's set to true
            businessType: searchParams.businessType,
            location: searchParams.location,
            timestamp: Timestamp.now(),
          });
          alert("Lead saved successfully!");
        } catch (error) {
          console.error("Error saving lead:", error);
          alert("Failed to save lead.");
          setSearchResults(originalResults); // Revert UI on failure
        }
      } else {
        setSearchResults(originalResults); // Revert UI if user cancels
      }
    } else {
      // --- This is the NEW LOGIC FOR UNCHECKING a box ---
      const confirmDelete = window.confirm(
        `Do you want to mark ${targetBusiness.name} as not contacted? This will remove the lead record.`
      );
      if (confirmDelete) {
        try {
          // Find the document in Firestore with the matching apiId to delete it
          const leadsQuery = query(collection(db, "leads"), where("apiId", "==", targetBusiness.apiId));
          const querySnapshot = await getDocs(leadsQuery);
          
          if (querySnapshot.empty) {
            alert("Could not find the saved lead to remove. It might have already been deleted.");
            return;
          }

          // Delete all documents that match the query (should only be one)
          const deletePromises = querySnapshot.docs.map(document => deleteDoc(doc(db, "leads", document.id)));
          await Promise.all(deletePromises);

          alert("Lead record removed successfully!");
        } catch (error) {
          console.error("Error removing lead:", error);
          alert("Failed to remove lead record.");
          setSearchResults(originalResults); // Revert UI on failure
        }
      } else {
        setSearchResults(originalResults); // Revert UI if user cancels
      }
    }
  };


  // -----------------------
  // Render (no changes)
  // -----------------------
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center">
      <header className="text-center py-12">
        <h1 className="text-5xl font-bold">Local Business Finder</h1>
      </header>
      <form
        onSubmit={handleSearch}
        className="w-full max-w-4xl bg-white p-8 rounded shadow grid grid-cols-1 md:grid-cols-3 gap-6"
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
            className="bg-blue-600 text-white px-6 py-3 rounded w-full hover:bg-blue-700 disabled:bg-blue-300"
            disabled={searchState === 'loading'}
          >
            {searchState === 'loading' ? 'Searching...' : 'Search'}
          </button>
        </div>
      </form>
      <div className="w-full max-w-6xl mt-12 px-4 mb-12">
        {searchState === "loading" && <p className="text-center">Searching businesses and fetching details...</p>}
        {searchState === "error" && (
          <p className="text-red-500 text-center">An error occurred during the search. Please try again.</p>
        )}
        {searchState === "success" && searchResults.length === 0 && (
             <p className="text-center text-gray-600">No businesses found for this search.</p>
        )}
        {searchState === "success" && searchResults.length > 0 && (
          <>
            <div className="overflow-x-auto w-full max-w-6xl mx-auto">
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
                           {b.website.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0]}
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
            {totalPages > 1 && (
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
                  onClick={() =>
                    setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                  }
                  disabled={currentPage === totalPages}
                  className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default App;