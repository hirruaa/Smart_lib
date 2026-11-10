import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.local' })
config()

if (process.env.CONFIRM_EBOOK_PROOF_PURGE !== '1') {
  throw new Error('Set CONFIRM_EBOOK_PROOF_PURGE=1 to confirm permanent proof-file deletion.')
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const bucketName = 'ebook-payment-proofs'
const { data: buckets, error: listError } = await supabase.storage.listBuckets()

if (listError) {
  throw new Error(`Unable to list Supabase Storage buckets: ${listError.message}`)
}

if (!buckets.some((bucket) => bucket.id === bucketName)) {
  console.log(`Storage bucket ${bucketName} is already absent.`)
} else {
  const { error: emptyError } = await supabase.storage.emptyBucket(bucketName)
  if (emptyError) {
    throw new Error(`Unable to delete files from ${bucketName}: ${emptyError.message}`)
  }

  const { error: deleteError } = await supabase.storage.deleteBucket(bucketName)
  if (deleteError) {
    throw new Error(`Unable to delete storage bucket ${bucketName}: ${deleteError.message}`)
  }

  console.log(`Deleted all files and the ${bucketName} bucket.`)
}
