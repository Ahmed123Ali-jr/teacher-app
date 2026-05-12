-- Some browsers / iOS set the uploaded PDF's MIME type to an empty string
-- or "application/octet-stream", which the strict allowed_mime_types check
-- on the bucket would reject. Drop the restriction (we still enforce PDF
-- via the file input's `accept` attribute on the client).
update storage.buckets
   set allowed_mime_types = null
 where id = 'books';
