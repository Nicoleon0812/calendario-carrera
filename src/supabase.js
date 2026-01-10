import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://lmqjiektrrhhlfqfiweq.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxtcWppZWt0cnJoaGxmcWZpd2VxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwMTIyODMsImV4cCI6MjA4MzU4ODI4M30.gG45skduy-v8CVv0sLELZV5EERj6WdsQREx2B1Exldo'

export const supabase = createClient(supabaseUrl, supabaseKey)