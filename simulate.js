const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

function validateEnvironment() {
  const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error(JSON.stringify({
      level: 'error',
      service: 'apt-realtime-simulation',
      message: 'Missing required environment variables',
      missing
    }));
    process.exit(1);
  }
}

validateEnvironment();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false }
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const VALID_STATUSES = new Set(['pending', 'shipped', 'delivered']);

function log(level, message, context = {}) {
  const safeContext = Object.fromEntries(
    Object.entries(context).filter(([, value]) => value !== undefined && value !== null)
  );
  const output = JSON.stringify({
    level,
    service: 'apt-realtime-simulation',
    message,
    ...safeContext
  });

  if (level === 'error') {
    console.error(output);
    return;
  }

  console.log(output);
}

function assertValidStatus(status) {
  if (!VALID_STATUSES.has(status)) {
    throw new Error(`Invalid order status requested: ${status}`);
  }
}

async function runPipelineTest() {
  let orderId = null;

  try {
    const initialStatus = 'pending';
    const updatedStatus = 'shipped';
    assertValidStatus(initialStatus);
    assertValidStatus(updatedStatus);

    log('info', 'Starting database mutation lifecycle simulation');

    log('info', 'Insert step started');
    const { data: insertRecords, error: insertError } = await supabase
      .from('orders')
      .insert([{ customer_name: 'Aditya Sen', product_name: 'Quant Engine Bundle X', status: initialStatus }])
      .select();

    if (insertError) {
      throw new Error(`Insert operation failed: ${insertError.message || JSON.stringify(insertError)}`);
    }

    orderId = insertRecords?.[0]?.id;
    if (!orderId) {
      throw new Error('Insert did not return a valid order ID. Aborting simulation.');
    }

    log('info', 'Insert completed', { orderId });
    await wait(3000);

    log('info', 'Update step started', { orderId, status: updatedStatus });
    const { error: updateError } = await supabase
      .from('orders')
      .update({ status: updatedStatus })
      .eq('id', orderId);

    if (updateError) {
      throw new Error(`Update operation failed: ${updateError.message || JSON.stringify(updateError)}`);
    }

    log('info', 'Update completed', { orderId });
    await wait(3000);

    log('info', 'Delete step started', { orderId });
    const { error: deleteError } = await supabase
      .from('orders')
      .delete()
      .eq('id', orderId);

    if (deleteError) {
      throw new Error(`Delete operation failed: ${deleteError.message || JSON.stringify(deleteError)}`);
    }

    log('info', 'Delete completed. Simulation finished', { orderId });
    orderId = null;
  } catch (error) {
    log('error', 'Simulation failed', { error: error.message || String(error), orderId });

    if (orderId) {
      const { error: cleanupError } = await supabase
        .from('orders')
        .delete()
        .eq('id', orderId);

      if (cleanupError) {
        log('error', 'Cleanup delete failed', {
          error: cleanupError.message || JSON.stringify(cleanupError),
          orderId
        });
      } else {
        log('info', 'Cleanup delete completed', { orderId });
      }
    }

    process.exit(1);
  }
}

runPipelineTest();
