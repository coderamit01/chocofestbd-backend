import { notificationService } from "../modules/notification/notification.service";

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

type Job = { name: string; everyMs: number; firstRunAfterMs: number; run: () => Promise<string | void> };

const jobs: Job[] = [
    {
        name: "delete-old-notifications",
        everyMs: DAY_MS,
        firstRunAfterMs: 5 * MINUTE_MS,
        run: async () => {
            const { deleted } = await notificationService.deleteOldNotifications();
            return deleted ? `deleted ${deleted} old notifications` : undefined;
        },
    },
];

const running = new Set<string>();

const runJob = async (job: Job) => {
    if (running.has(job.name)) return;

    running.add(job.name);

    try {
        const result = await job.run();
        if (result) console.log(`[job:${job.name}] ${result}`);
    } catch (error) {
        console.error(`[job:${job.name}] failed:`, error);
    } finally {
        running.delete(job.name);
    }
};

export const startJobs = () => {
    for (const job of jobs) {
        setTimeout(() => void runJob(job), job.firstRunAfterMs).unref();
        setInterval(() => void runJob(job), job.everyMs).unref();
    }
};
