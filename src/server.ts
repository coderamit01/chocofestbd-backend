import { prisma } from './lib/prisma'
import app from './app'
import { startJobs } from './jobs'



const port = process.env.PORT || 5000;

async function main() {
  try {
    await prisma.$connect()
    app.listen(port, () => {
      console.log(`Server running on port ${port}`)
      startJobs()
    })
  } catch (error) {
    await prisma.$disconnect()
    console.log("Server error: ", error);
  }

}

main()
