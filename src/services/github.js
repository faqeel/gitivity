import moment from 'moment';
import { Octokit } from '@octokit/rest';
import { spin } from '../util/spinner.js';

/**
 * Export action activity from GitHub.
 *
 * @param {object} args
 *      the argument passed to the command line.
 * @returns
 *      an array of actions to emit to stdout.
 */
export default async function* fetch(args) {
    // open GitHub API cliemt
    let client = new Octokit({
        auth: args.token,
        baseUrl: args.baseUrl,
    });

    // retrieve the current user info
    let viewer = await client.graphql(`{
        viewer {
            name
            email
            login
            createdAt
        }
    }`);

    // initialize timestamps
    let user = viewer.viewer;
    let author = `${user.name} <${user.email}>`;
    let created = args.from ? moment.utc(args.from) : moment.utc(user.createdAt);
    let current = moment.utc();

    // buffer all years before yielding to avoid racing with import spinner
    let actions = [];

    // walk through all actions (yearly)
    while (created.isBefore(current)) {
        let year = created.year();
        let lower = created.toISOString();
        let upper = created.add(1, 'year').toISOString();

        // start spinner for this year
        let spinner = spin(`Fetching ${year} activity...`);

        // current year
        let query = `{
            user(login: "${user.login}") {
                contributionsCollection(from: "${lower}", to: "${upper}") {
                    contributionCalendar {
                        weeks {
                            contributionDays {
                                contributionCount
                                date
                            }
                        }
                    }
                }
            }
        }`;

        // pull back the bucket of weeks to walk
        let result = await client.graphql(query);
        let bucket = result.user.contributionsCollection.contributionCalendar.weeks;

        // count contributions and update spinner before completing
        let yearTotal = bucket.reduce(
            (sum, week) =>
                sum + week.contributionDays.reduce((s, day) => s + day.contributionCount, 0),
            0,
        );

        spinner.update(`Fetching ${year} activity... (${yearTotal} contributions)`);
        spinner.done();

        // flatten into actions
        for (let week of bucket) {
            for (let day of week.contributionDays) {
                for (let i = 1; i <= day.contributionCount; i++) {
                    let date = moment.utc(day.date);
                    actions.push({
                        id: `${date.valueOf()}${i}`,
                        name: user.name,
                        email: user.email,
                        author,
                        timestamp: date,
                    });
                }
            }
        }
    }

    // yield back
    yield* actions;
}
