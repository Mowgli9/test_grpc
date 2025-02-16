import chalk from "chalk";

export const logger = {
    success: (msg: string) => console.log(chalk.green.bold(`✔ ${msg}`)),
    warn: (msg: string) => console.log(chalk.yellow.bold(`⚠ ${msg}`)),
    error: (msg: string) => console.log(chalk.red.bold(`✖ ${msg}`)),
    info: (msg: string) => console.log(chalk.blue.bold(`ℹ ${msg}`)),
};