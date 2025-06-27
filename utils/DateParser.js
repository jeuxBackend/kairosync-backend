const parseDate = (dateInput, options = {}) => {
  const {
    validateAge = false,
    maxAge = 150,
    outputFormat = 'date'
  } = options;

  if (dateInput === null || dateInput === undefined) {
    throw new Error('Date input is required');
  }

  let parsedDate;

  try {
    if (dateInput instanceof Date) {
      parsedDate = new Date(dateInput);
    } else if (typeof dateInput === 'string') {
      const cleanInput = dateInput.trim();
      
      if (cleanInput === '') {
        throw new Error('Date string cannot be empty');
      }

      if (/^\d{10,13}$/.test(cleanInput)) {
        const timestamp = parseInt(cleanInput);
        parsedDate = new Date(timestamp < 10000000000 ? timestamp * 1000 : timestamp);
      }
      else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(cleanInput)) {
        const parts = cleanInput.split('/');
        if (parseInt(parts[0]) > 12) {
          parsedDate = new Date(`${parts[1]}/${parts[0]}/${parts[2]}`);
        } else {
          parsedDate = new Date(cleanInput);
          if (isNaN(parsedDate.getTime())) {
            parsedDate = new Date(`${parts[1]}/${parts[0]}/${parts[2]}`);
          }
        }
      }
      else if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(cleanInput)) {
        const parts = cleanInput.split('-');
        if (parseInt(parts[0]) > 12) {
          parsedDate = new Date(`${parts[1]}-${parts[0]}-${parts[2]}`);
        } else {
          parsedDate = new Date(cleanInput);
          if (isNaN(parsedDate.getTime())) {
            parsedDate = new Date(`${parts[1]}-${parts[0]}-${parts[2]}`);
          }
        }
      }
      else if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(cleanInput)) {
        const parts = cleanInput.split('.');
        parsedDate = new Date(`${parts[1]}/${parts[0]}/${parts[2]}`);
      }
      else {
        parsedDate = new Date(cleanInput);
      }
    } else if (typeof dateInput === 'number') {
      parsedDate = new Date(dateInput < 10000000000 ? dateInput * 1000 : dateInput);
    } else {
      throw new Error(`Unsupported date input type: ${typeof dateInput}`);
    }

    if (isNaN(parsedDate.getTime())) {
      throw new Error('Invalid date format');
    }

    if (validateAge) {
      const currentDate = new Date();
      const minDate = new Date(currentDate.getFullYear() - maxAge, 0, 1);
      const maxDate = new Date(); 

      if (parsedDate < minDate) {
        throw new Error(`Date cannot be more than ${maxAge} years ago`);
      }
      
      if (parsedDate > maxDate) {
        throw new Error('Date cannot be in the future');
      }
    }

    switch (outputFormat.toLowerCase()) {
      case 'iso':
        return parsedDate.toISOString();
      case 'yyyy-mm-dd':
        return parsedDate.toISOString().split('T')[0];
      case 'date':
      default:
        return parsedDate;
    }

  } catch (error) {
    throw new Error(`Date parsing failed: ${error.message}`);
  }
};


const parseDateOfBirth = (dateInput) => {
  return parseDate(dateInput, { 
    validateAge: true, 
    maxAge: 150,
    outputFormat: 'date' 
  });
};


const getDbDate = (dateInput) => {
  return parseDate(dateInput, { outputFormat: 'yyyy-mm-dd' });
};


const testDateParser = () => {
  const testDates = [
    '2023-12-25',         
    '25/12/2023',           
    '12/25/2023',         
    '25-12-2023',          
    '25.12.2023',        
    '1703462400',         
    '1703462400000',        
    new Date('2023-12-25'), 
    1703462400000,         
  ];

  console.log('Testing date parser:');
  testDates.forEach(date => {
    try {
      const result = parseDate(date);
      console.log(`Input: ${date} => Output: ${result.toISOString()}`);
    } catch (error) {
      console.log(`Input: ${date} => Error: ${error.message}`);
    }
  });
};

module.exports = {
  parseDate,
  parseDateOfBirth,
  getDbDate,
  testDateParser
};

