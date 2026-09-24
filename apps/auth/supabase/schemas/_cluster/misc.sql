DO $cron$
DECLARE
  purge_job_id bigint;
BEGIN
  SELECT jobid
  INTO purge_job_id
  FROM cron.job
  WHERE jobname = 'purge-verification-codes'
    AND database = current_database()
  ORDER BY jobid
  LIMIT 1;

  IF purge_job_id IS NULL THEN
    PERFORM cron.schedule_in_database(
      'purge-verification-codes',
      '*/15 * * * *',
      'SELECT public.purge_expired_verification_codes()',
      current_database()
    );
  ELSE
    PERFORM cron.alter_job(
      purge_job_id,
      schedule => '*/15 * * * *',
      command => 'SELECT public.purge_expired_verification_codes()',
      database => current_database(),
      active => true
    );
  END IF;
END;
$cron$;
