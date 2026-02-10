/**
 * Cron Job Endpoint
 * This endpoint is called by Vercel Cron to trigger the scheduler logic.
 */

const { createClient } = require('@supabase/supabase-js');
const scheduler = require('../scheduler');

// Initialize Supabase client
// We create a new client here because this functions as a serverless function
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

module.exports = async (req, res) => {
    try {
        // Optional: Check for CRON_SECRET if you want to secure this
        // const authHeader = req.headers.authorization;
        // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        //   return res.status(401).end('Unauthorized');
        // }

        console.log('⏰ Cron job triggered via API');

        // Pass the supabase client to the scheduler
        await scheduler.processPendingChasers(supabase);

        res.status(200).json({ success: true, message: 'Chaser processing triggered' });
    } catch (error) {
        console.error('❌ Cron job failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};
