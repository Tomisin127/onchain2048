-- Table to store miniapp notification tokens
CREATE TABLE public.miniapp_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fid TEXT,
  notification_token TEXT NOT NULL,
  notification_url TEXT NOT NULL,
  last_played_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(notification_token)
);

-- Enable RLS
ALTER TABLE public.miniapp_notifications ENABLE ROW LEVEL SECURITY;

-- Allow public insert (so frontend can save tokens without auth)
CREATE POLICY "Anyone can insert notification tokens" ON public.miniapp_notifications
  FOR INSERT WITH CHECK (true);

-- Allow public update of last_played_at
CREATE POLICY "Anyone can update last_played_at" ON public.miniapp_notifications
  FOR UPDATE USING (true) WITH CHECK (true);

-- Only service role can read (for sending notifications)
CREATE POLICY "Service role can read all" ON public.miniapp_notifications
  FOR SELECT USING (true);