require('dotenv').config(); // Load environment variables from .env file
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const ms = require('ms'); // For handling durations
const express = require('express'); // Import Express
const app = express(); // Create an Express app

// Initialize Discord Client
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

const PREFIX = process.env.PREFIX;
const TOKEN = process.env.TOKEN;

const giveaways = new Map(); // { messageID: { channelID, duration, winnerCount, prize, endTime } }

// Update the giveaway message every second
const updateGiveawayMessage = async (messageID) => {
    const giveaway = giveaways.get(messageID);
    const now = Date.now();
    
    try {
        // Fetch the channel and the message
        const channel = await client.channels.fetch(giveaway.channelID);
        const giveawayMessage = await channel.messages.fetch(messageID);
        const remainingTime = giveaway.endTime - now;
        
        if (remainingTime <= 0) {
            giveaways.delete(messageID); // Remove the giveaway if the time is up
            const reactions = await giveawayMessage.reactions.cache.get('🎉').users.fetch();
            const entries = reactions.filter(user => !user.bot).map(user => user.id);
            const winners = [];

            for (let i = 0; i < giveaway.winnerCount; i++) {
                if (entries.length === 0) break;
                const winnerIndex = Math.floor(Math.random() * entries.length);
                winners.push(entries.splice(winnerIndex, 1)[0]);
            }

            const embed = new EmbedBuilder()
                .setTitle('🎉 Giveaway Ended 🎉')
                .setDescription(`Prize: ${giveaway.prize}\nWinners: ${winners.map(id => `<@${id}>`).join(', ')}`)
                .setFooter({ text: 'Giveaway Ended' })
                .setTimestamp();

            await giveawayMessage.edit({ embeds: [embed] });
            await channel.send(`Congratulations ${winners.map(id => `<@${id}>`).join(', ')}! You won the prize: ${giveaway.prize}`);
        } else {
            const durationString = ms(remainingTime, { long: true });
            const embed = new EmbedBuilder()
                .setTitle('🎉 Giveaway 🎉')
                .setDescription(`Prize: ${giveaway.prize}\nReact with 🎉 to enter!\n\nEnds In: ${durationString}`)
                .setFooter({ text: 'Giveaway' })
                .setTimestamp();
            
            await giveawayMessage.edit({ embeds: [embed] });
        }
    } catch (error) {
        console.error(`Failed to update giveaway message: ${error.message}`);
        giveaways.delete(messageID); // Clean up if there's an error
    }
};

// Check for expired giveaways and update messages every second
setInterval(() => {
    for (const messageID of giveaways.keys()) {
        updateGiveawayMessage(messageID);
    }
}, 1000); // Update every second

// Set up the Express server
app.use(express.json()); // Middleware to parse JSON bodies

// Example endpoint
app.get('/', (req, res) => {
    res.send('Hello, world!');
});

app.post('/webhook', (req, res) => {
    const data = req.body;
    console.log('Received webhook data:', data);
    res.send('Webhook received!');
});

// Start the Express server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// Initialize Discord Bot
client.once('ready', () => {
    console.log('Bot is online!');
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === 'ping') {
        const sentMessage = await message.channel.send('Pinging...');
        const latency = sentMessage.createdTimestamp - message.createdTimestamp;
        sentMessage.edit(`Pong! 🏓 Latency is ${latency}ms.`);
    } else if (command === 'gstart') {
        if (args.length < 3) return message.reply('Usage: !gstart <duration> <winner> <prize>');

        const duration = ms(args[0]);
        if (!duration) return message.reply('Invalid duration. Use a format like `1d`, `2h`, `30m`.');

        const winnerCount = parseInt(args[1]);
        if (isNaN(winnerCount) || winnerCount <= 0) return message.reply('Invalid winner count. It must be a positive number.');

        const prize = args.slice(2).join(' ');
        if (!prize) return message.reply('You must specify a prize.');

        const embed = new EmbedBuilder()
            .setTitle('🎉 Giveaway 🎉')
            .setDescription(`Prize: ${prize}\nReact with 🎉 to enter!\n\nEnds In: ${ms(duration, { long: true })}`)
            .setFooter({ text: 'Giveaway' })
            .setTimestamp();

        const giveawayMessage = await message.channel.send({ embeds: [embed] });
        await giveawayMessage.react('🎉');

        const endTime = Date.now() + duration;
        giveaways.set(giveawayMessage.id, { channelID: message.channel.id, duration, winnerCount, prize, endTime });
    } else if (command === 'gend') {
        const messageID = args[0];
        if (!messageID || !giveaways.has(messageID)) return message.reply('Invalid message ID or no giveaway found with that ID.');

        const giveaway = giveaways.get(messageID);
        const channel = await client.channels.fetch(giveaway.channelID);
        const giveawayMessage = await channel.messages.fetch(messageID);
        const reactions = await giveawayMessage.reactions.cache.get('🎉').users.fetch();

        const entries = reactions.filter(user => !user.bot).map(user => user.id);
        const winners = [];

        for (let i = 0; i < giveaway.winnerCount; i++) {
            if (entries.length === 0) break;
            const winnerIndex = Math.floor(Math.random() * entries.length);
            winners.push(entries.splice(winnerIndex, 1)[0]);
        }

        const embed = new EmbedBuilder()
            .setTitle('🎉 Giveaway Ended 🎉')
            .setDescription(`Prize: ${giveaway.prize}\nWinners: ${winners.map(id => `<@${id}>`).join(', ')}`)
            .setFooter({ text: 'Giveaway Ended' })
            .setTimestamp();

        await giveawayMessage.edit({ embeds: [embed] });
        await channel.send(`Congratulations ${winners.map(id => `<@${id}>`).join(', ')}! You won the prize: ${giveaway.prize}`);
        giveaways.delete(messageID);
    } else if (command === 'greroll') {
        const messageID = args[0];
        if (!messageID || !giveaways.has(messageID)) return message.reply('Invalid message ID or no giveaway found with that ID.');

        const giveaway = giveaways.get(messageID);
        const channel = await client.channels.fetch(giveaway.channelID);
        const giveawayMessage = await channel.messages.fetch(messageID);
        const reactions = await giveawayMessage.reactions.cache.get('🎉').users.fetch();

        const entries = reactions.filter(user => !user.bot).map(user => user.id);
        const winners = [];

        for (let i = 0; i < giveaway.winnerCount; i++) {
            if (entries.length === 0) break;
            const winnerIndex = Math.floor(Math.random() * entries.length);
            winners.push(entries.splice(winnerIndex, 1)[0]);
        }

        const embed = new EmbedBuilder()
            .setTitle('🎉 Giveaway Reroll 🎉')
            .setDescription(`Prize: ${giveaway.prize}\nNew Winners: ${winners.map(id => `<@${id}>`).join(', ')}`)
            .setFooter({ text: 'Giveaway Reroll' })
            .setTimestamp();

        await giveawayMessage.edit({ embeds: [embed] });
        await channel.send(`Congratulations ${winners.map(id => `<@${id}>`).join(', ')}! You won the prize: ${giveaway.prize}`);
    } else if (command === 'help') {
        const helpEmbed = new EmbedBuilder()
            .setTitle('Bot Commands')
            .setDescription('Here are the commands you can use:')
            .addFields([
                { name: '!ping', value: 'Check the bot\'s latency.' },
                { name: '!gstart <duration> <winner> <prize>', value: 'Start a giveaway. Duration can be in days (d), hours (h), or minutes (m).' },
                { name: '!gend <messageID>', value: 'End a giveaway and announce the winners.' },
                { name: '!greroll <messageID>', value: 'Reroll winners for an ended giveaway.' }
            ])
            .setFooter({ text: 'Bot Help' })
            .setTimestamp();

        message.channel.send({ embeds: [helpEmbed] });
    }
});

client.login(TOKEN);

