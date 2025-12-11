const express = require('express');
const path = require('path');
const db = require('./config/db');

const app = express();
const PORT = 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

app.get('/', async (req, res) => {
  try {
    const [persons] = await db.execute(`
      SELECT p.*, c.city_name
      FROM person p
      JOIN city c ON p.city_id = c.city_id
      ORDER BY p.surname, p.name
    `);

    const [orgs] = await db.execute(`
      SELECT o.*, c.city_name, cat.category_name, GROUP_CONCAT(op.phone_number SEPARATOR ', ') as phones
      FROM organization o
      JOIN city c ON o.city_id = c.city_id
      JOIN category cat ON o.category_id = cat.category_id
      LEFT JOIN org_phone op ON o.org_id = op.org_id
      GROUP BY o.org_id
      ORDER BY c.city_name, cat.category_name, o.org_name
    `);

    const [cities] = await db.execute('SELECT * FROM city ORDER BY city_name');
    const [categories] = await db.execute('SELECT * FROM category ORDER BY category_name');
    const [countries] = await db.execute('SELECT * FROM country ORDER BY country_name');
    res.render('index', { persons, orgs, cities, categories, countries });
  } catch (err) {
    console.error(err);
    res.status(500).send('Ошибка загрузки данных');
  }
});
app.post('/add-person', async (req, res) => {
  const { surname, name, patronymic, streetname, homenumber, building, apartment, phone_number, city_id } = req.body;
  try {
    await db.execute(
      `INSERT INTO person (surname, name, patronymic, streetname, homenumber, building, apartment, phone_number, city_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [surname, name, patronymic, streetname, homenumber, building, apartment, phone_number, city_id]
    );
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.status(500).send('Ошибка добавления человека');
  }
});
app.post('/add-country', async (req, res) => {
  const { country_name } = req.body;
  if (!country_name?.trim()) {
    return res.status(400).send('Название страны не может быть пустым');
  }
  try {
    await db.execute('INSERT INTO country (country_name) VALUES (?)', [country_name.trim()]);
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.status(500).send('Ошибка добавления страны');
  }
});
app.get('/edit-person/:id', async (req, res) => {
  const [persons] = await db.execute('SELECT * FROM person WHERE person_id = ?', [req.params.id]);
  const [cities] = await db.execute('SELECT * FROM city ORDER BY city_name');
  if (!persons[0]) return res.status(404).send('Запись не найдена');
  res.render('edit-person', { person: persons[0], cities });
});

app.post('/edit-person/:id', async (req, res) => {
  const { surname, name, patronymic, streetname, homenumber, building, apartment, phone_number, city_id } = req.body;
  await db.execute(
    `UPDATE person SET surname=?, name=?, patronymic=?, streetname=?, homenumber=?, building=?, apartment=?, phone_number=?, city_id=? WHERE person_id=?`,
    [surname, name, patronymic, streetname, homenumber, building, apartment, phone_number, city_id, req.params.id]
  );
  res.redirect('/');
});

app.get('/delete-person/:id', async (req, res) => {
  await db.execute('DELETE FROM person WHERE person_id = ?', [req.params.id]);
  res.redirect('/');
});

app.get('/edit-org/:id', async (req, res) => {
  const [orgs] = await db.execute(`
    SELECT o.*, GROUP_CONCAT(op.phone_number SEPARATOR ',') as phones
    FROM organization o
    LEFT JOIN org_phone op ON o.org_id = op.org_id
    WHERE o.org_id = ?
    GROUP BY o.org_id
  `, [req.params.id]);
  const [cities] = await db.execute('SELECT * FROM city ORDER BY city_name');
  const [categories] = await db.execute('SELECT * FROM category ORDER BY category_name');
  if (!orgs[0]) return res.status(404).send('Организация не найдена');
  res.render('edit-org', { org: orgs[0], cities, categories });
});

app.post('/edit-org/:id', async (req, res) => {
  const { org_name, streetname, homenumber, building, office, city_id, category_id } = req.body;
  const phones = req.body.phones ? (Array.isArray(req.body.phones) ? req.body.phones : [req.body.phones]) : [];
  await db.execute(
    `UPDATE organization SET org_name=?, streetname=?, homenumber=?, building=?, office=?, city_id=?, category_id=? WHERE org_id=?`,
    [org_name, streetname, homenumber, building, office, city_id, category_id, req.params.id]
  );
  await db.execute('DELETE FROM org_phone WHERE org_id = ?', [req.params.id]);
  for (const phone of phones) {
    if (phone.trim()) {
      await db.execute('INSERT INTO org_phone (phone_number, org_id) VALUES (?, ?)', [phone.trim(), req.params.id]);
    }
  }
  res.redirect('/');
});

app.get('/delete-org/:id', async (req, res) => {
  await db.execute('DELETE FROM org_phone WHERE org_id = ?', [req.params.id]);
  await db.execute('DELETE FROM organization WHERE org_id = ?', [req.params.id]);
  res.redirect('/');
});

app.get('/edit-city/:id', async (req, res) => {
  const [cities] = await db.execute('SELECT * FROM city WHERE city_id = ?', [req.params.id]);
  const [countries] = await db.execute('SELECT * FROM country ORDER BY country_name');
  if (!cities[0]) return res.status(404).send('Город не найден');
  res.render('edit-city', { city: cities[0], countries });
});

app.post('/edit-city/:id', async (req, res) => {
  const { city_name, phone_code, country_id } = req.body;
  await db.execute(
    `UPDATE city SET city_name=?, phone_code=?, country_id=? WHERE city_id=?`,
    [city_name, phone_code, country_id, req.params.id]
  );
  res.redirect('/');
});

app.get('/delete-city/:id', async (req, res) => {
  try {
    await db.execute('DELETE FROM city WHERE city_id = ?', [req.params.id]);
    res.redirect('/');
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(400).send('Невозможно удалить город: есть связанные записи в person или organization');
    }
    throw err;
  }
});

app.get('/edit-category/:id', async (req, res) => {
  const [cats] = await db.execute('SELECT * FROM category WHERE category_id = ?', [req.params.id]);
  if (!cats[0]) return res.status(404).send('Рубрика не найдена');
  res.render('edit-category', { category: cats[0] });
});

app.post('/edit-category/:id', async (req, res) => {
  const { category_name } = req.body;
  await db.execute('UPDATE category SET category_name = ? WHERE category_id = ?', [category_name, req.params.id]);
  res.redirect('/');
});

app.get('/delete-category/:id', async (req, res) => {
  try {
    await db.execute('DELETE FROM category WHERE category_id = ?', [req.params.id]);
    res.redirect('/');
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(400).send('Невозможно удалить рубрику: есть связанные организации');
    }
    throw err;
  }
});

app.get('/edit-country/:id', async (req, res) => {
  const [countries] = await db.execute('SELECT * FROM country WHERE country_id = ?', [req.params.id]);
  if (!countries[0]) return res.status(404).send('Страна не найдена');
  res.render('edit-country', { country: countries[0] });
});

app.post('/edit-country/:id', async (req, res) => {
  const { country_name } = req.body;
  await db.execute('UPDATE country SET country_name = ? WHERE country_id = ?', [country_name, req.params.id]);
  res.redirect('/');
});

app.get('/delete-country/:id', async (req, res) => {
  try {
    await db.execute('DELETE FROM country WHERE country_id = ?', [req.params.id]);
    res.redirect('/');
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(400).send('Невозможно удалить страну: есть связанные города');
    }
    throw err;
  }
});

app.post('/add-org', async (req, res) => {
  const { org_name, streetname, homenumber, building, office, city_id, category_id } = req.body;
  const phones = req.body.phones ? (Array.isArray(req.body.phones) ? req.body.phones : [req.body.phones]) : [];

  try {
    const [result] = await db.execute(
      `INSERT INTO organization (org_name, streetname, homenumber, building, office, city_id, category_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [org_name, streetname, homenumber, building, office, city_id, category_id]
    );

    const org_id = result.insertId;
    for (const phone of phones) {
      if (phone.trim()) {
        await db.execute('INSERT INTO org_phone (phone_number, org_id) VALUES (?, ?)', [phone.trim(), org_id]);
      }
    }

    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.status(500).send('Ошибка добавления организации');
  }
});

app.get('/delete-person/:id', async (req, res) => {
  try {
    await db.execute('DELETE FROM person WHERE person_id = ?', [req.params.id]);
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.status(500).send('Ошибка удаления');
  }
});

app.get('/delete-org/:id', async (req, res) => {
  try {
    await db.execute('DELETE FROM org_phone WHERE org_id = ?', [req.params.id]);
    await db.execute('DELETE FROM organization WHERE org_id = ?', [req.params.id]);
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.status(500).send('Ошибка удаления');
  }
});

app.get('/search', async (req, res) => {
  const { surname, city_id, category_id } = req.body || req.query;

  let personQuery = `
    SELECT p.*, c.city_name
    FROM person p
    JOIN city c ON p.city_id = c.city_id
    WHERE 1=1
  `;
  let orgQuery = `
    SELECT o.*, c.city_name, cat.category_name, GROUP_CONCAT(op.phone_number SEPARATOR ', ') as phones
    FROM organization o
    JOIN city c ON o.city_id = c.city_id
    JOIN category cat ON o.category_id = cat.category_id
    LEFT JOIN org_phone op ON o.org_id = op.org_id
    WHERE 1=1
  `;

  const params = [];

  if (surname) {
    personQuery += ' AND p.surname LIKE ?';
    params.push(`%${surname}%`);
  }

  if (city_id && city_id !== 'all') {
    personQuery += ' AND p.city_id = ?';
    orgQuery += ' AND o.city_id = ?';
    params.push(city_id);
  }

  if (category_id && category_id !== 'all') {
    orgQuery += ' AND o.category_id = ?';
    params.push(category_id);
  }

  personQuery += ' ORDER BY p.surname';
  orgQuery += ' GROUP BY o.org_id ORDER BY c.city_name';

  try {
    const [persons] = await db.execute(personQuery, params);
    const [orgs] = await db.execute(orgQuery, params);
    const [cities] = await db.execute('SELECT * FROM city ORDER BY city_name');
    const [categories] = await db.execute('SELECT * FROM category ORDER BY category_name');

    res.render('index', { persons, orgs, cities, categories, search: req.query });
  } catch (err) {
    console.error(err);
    res.status(500).send('Ошибка поиска');
  }
});

app.post('/add-category', async (req, res) => {
  const { category_name } = req.body;
  if (!category_name?.trim()) {
    return res.status(400).send('Название рубрики не может быть пустым');
  }
  try {
    await db.execute('INSERT INTO category (category_name) VALUES (?)', [category_name.trim()]);
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.status(500).send('Ошибка добавления рубрики');
  }
});

app.post('/add-city', async (req, res) => {
  const { city_name, phone_code, country_id } = req.body;
  if (!city_name?.trim() || !phone_code?.trim() || !country_id) {
    return res.status(400).send('Все поля города обязательны');
  }
  try {
    await db.execute(
      'INSERT INTO city (city_name, phone_code, country_id) VALUES (?, ?, ?)',
      [city_name.trim(), phone_code.trim(), country_id]
    );
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.status(500).send('Ошибка добавления города');
  }
});
app.use('/reports', require('./routes/reports'));

app.listen(PORT, () => {
  console.log(`✅ Сервер запущен на http://localhost:${PORT}`);
});

