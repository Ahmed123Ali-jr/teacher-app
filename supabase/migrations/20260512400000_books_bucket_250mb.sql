-- Raise the books bucket file-size cap to 250 MB.
update storage.buckets
   set file_size_limit = 262144000   -- 250 MB
 where id = 'books';
