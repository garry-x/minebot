#!/usr/bin/env node
// Test script to verify bat translation

// First, let's check if the translation was added correctly
console.log('Checking bat translation in cli.js...\n');

// Read a snippet of the cli.js file to verify
const fs = require('fs');
const path = require('path');

try {
  const cliContent = fs.readFileSync(path.join(__dirname, 'cli.js'), 'utf8');
  
  // Check if 'bat': '蝙蝠' exists
  if (cliContent.includes("'bat': '蝙蝠'")) {
    console.log('✅ Translation found: "bat": "蝙蝠"');
    
    // Extract entityTranslations section to verify
    const entityTranslationsMatch = cliContent.match(/const entityTranslations = \{([\s\S]*?)\};/);
    if (entityTranslationsMatch) {
      const entitySection = entityTranslationsMatch[1];
      if (entitySection.includes("'bat': '蝙蝠'")) {
        console.log('✅ "bat" translation correctly placed in entityTranslations object');
      }
    }
  } else {
    console.log('❌ Translation NOT found: "bat": "蝙蝠"');
  }
  
  // Test the translation function logic
  console.log('\n--- Testing translation logic ---');
  
  // Simulate the translateResourceName function logic
  const blockTranslations = {};
  const itemTranslations = {};
  const entityTranslations = {
    'bee': '蜜蜂',
    'bat': '蝙蝠',
    'fox': '狐狸',
    'zombie': '僵尸'
  };
  
  function testTranslateResourceName(name) {
    if (blockTranslations[name]) return blockTranslations[name];
    if (itemTranslations[name]) return itemTranslations[name];
    if (entityTranslations[name]) return entityTranslations[name];
    return name;
  }
  
  // Test cases
  const testCases = [
    { input: 'bat', expected: '蝙蝠', description: 'Bat translation' },
    { input: 'zombie', expected: '僵尸', description: 'Existing translation' },
    { input: 'unknown_mob', expected: 'unknown_mob', description: 'Unknown mob (no translation)' },
    { input: 'bee', expected: '蜜蜂', description: 'Bee translation' }
  ];
  
  console.log('\nTranslation function test results:');
  testCases.forEach(test => {
    const result = testTranslateResourceName(test.input);
    const passed = result === test.expected;
    console.log(`${passed ? '✅' : '❌'} ${test.description}: "${test.input}" → "${result}" ${passed ? '' : `(expected: "${test.expected}")`}`);
  });
  
  // Test event description translation
  console.log('\n--- Testing event description translation ---');
  
  function testTranslateEventDescription(description) {
    if (description.startsWith('击杀 ')) {
      const entityName = description.substring(3);
      const translatedName = testTranslateResourceName(entityName);
      return `击杀 ${translatedName}`;
    }
    return description;
  }
  
  const eventTests = [
    { input: '击杀 bat', expected: '击杀 蝙蝠', description: 'Kill bat event' },
    { input: '击杀 zombie', expected: '击杀 僵尸', description: 'Kill zombie event' },
    { input: '击杀 unknown', expected: '击杀 unknown', description: 'Kill unknown mob event' },
    { input: '挖掘 stone', expected: '挖掘 stone', description: 'Break event (no translation in this test)' }
  ];
  
  eventTests.forEach(test => {
    const result = testTranslateEventDescription(test.input);
    const passed = result === test.expected;
    console.log(`${passed ? '✅' : '❌'} ${test.description}: "${test.input}" → "${result}" ${passed ? '' : `(expected: "${test.expected}")`}`);
  });
  
} catch (error) {
  console.error('Error:', error.message);
}

console.log('\n--- Complete ---');