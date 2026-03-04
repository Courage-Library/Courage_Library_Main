
// Only create client if it doesn't already exist
if (!window.client) {

  const SUPABASE_URL = "https://sgagswxzsxlgcspwiuoh.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNnYWdzd3h6c3hsZ2NzcHdpdW9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NTA1NTIsImV4cCI6MjA2OTUyNjU1Mn0.ZNfk5WNDPkjKcFsRO48rEYk3dhbLYm_m21aZ-wfywo4";

  window.client = supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  );

}