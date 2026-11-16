import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { createHashRouter, isRouteErrorResponse, RouterProvider, useRouteError } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Spinner } from "./components/ui";
import "./index.css";

const CommandCenter = lazy(() => import("./pages/CommandCenter"));
const Lots = lazy(() => import("./pages/Lots"));
const LotDetail = lazy(() => import("./pages/LotDetail"));
const Planner = lazy(() => import("./pages/Planner"));
const Assumptions = lazy(() => import("./pages/Assumptions"));
const ModelPage = lazy(() => import("./pages/ModelPage"));
const DataExplorer = lazy(() => import("./pages/DataExplorer"));
const Summary = lazy(() => import("./pages/Summary"));
const Demo = lazy(() => import("./pages/Demo"));
const About = lazy(() => import("./pages/About"));

const wrap = (el: React.ReactNode) => (
  <Suspense
    fallback={
      <div className="flex items-center gap-2 p-10 text-ink-3">
        <Spinner /> Loading…
      </div>
    }
  >
    {el}
  </Suspense>
);

function RouteError() {
  const err = useRouteError();
  const notFound = isRouteErrorResponse(err) && err.status === 404;
  return (
    <div className="mx-auto max-w-xl p-10">
      <h1 className="font-display text-2xl font-semibold">{notFound ? "Page not found" : "Something went wrong"}</h1>
      <p className="mt-2 text-ink-2">
        {notFound ? "That address does not match a page." : String(err instanceof Error ? err.message : err)}{" "}
        <a className="text-sky underline" href="#/">Return to the Command Center</a>.
      </p>
    </div>
  );
}

// Hash routing so the built app works from any static host or straight from the file system.
const router = createHashRouter([
  {
    path: "/",
    element: <Layout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: wrap(<CommandCenter />) },
      { path: "lots", element: wrap(<Lots />) },
      { path: "lots/:id", element: wrap(<LotDetail />) },
      { path: "plan", element: wrap(<Planner />) },
      { path: "assumptions", element: wrap(<Assumptions />) },
      { path: "model", element: wrap(<ModelPage />) },
      { path: "data", element: wrap(<DataExplorer />) },
      { path: "summary", element: wrap(<Summary />) },
      { path: "demo", element: wrap(<Demo />) },
      { path: "about", element: wrap(<About />) },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
