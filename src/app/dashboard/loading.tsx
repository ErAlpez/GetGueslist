import "./loading.css";

export default function DashboardLoading() {
  return (
    <div aria-busy="true" aria-label="Loading dashboard page" className="dashboard-loading" role="status">
      <div className="dashboard-loading-heading">
        <span className="dashboard-loading-block dashboard-loading-kicker" />
        <span className="dashboard-loading-block dashboard-loading-title" />
        <span className="dashboard-loading-block dashboard-loading-description" />
      </div>
      <div className="dashboard-loading-stats">
        {Array.from({ length: 4 }, (_, index) => (
          <span className="dashboard-loading-block dashboard-loading-stat" key={index} />
        ))}
      </div>
      <div className="dashboard-loading-panels">
        <span className="dashboard-loading-block dashboard-loading-panel" />
        <span className="dashboard-loading-block dashboard-loading-panel" />
        <span className="dashboard-loading-block dashboard-loading-panel" />
      </div>
    </div>
  );
}
