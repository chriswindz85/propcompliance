import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://rptmjcvjmfzxndvroooy.supabase.co'
const SUPABASE_KEY = 'sb_publishable_9q9UiJGhvgzyb3-79PW_PA_LKz_ULwj'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
