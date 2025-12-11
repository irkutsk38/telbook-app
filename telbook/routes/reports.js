const express = require('express');
const router = express.Router();
const db = require('../config/db');

router.get('/cities', async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT city_name, phone_code 
      FROM city 
      ORDER BY city_name ASC
    `);
    res.render('reports/report1', { cities: rows });
  } catch (err) {
    console.error(err);
    res.status(500).send('Ошибка отчёта 1');
  }
});

router.get('/persons', async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT p.surname, p.name, p.patronymic, p.phone_number, c.city_name
      FROM person p
      JOIN city c ON p.city_id = c.city_id
      ORDER BY p.surname ASC
    `);
    res.render('reports/report2', { persons: rows });
  } catch (err) {
    console.error(err);
    res.status(500).send('Ошибка отчёта 2');
  }
});

router.get('/organizations', async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT 
        c.city_name,
        cat.category_name,
        o.org_name,
        GROUP_CONCAT(op.phone_number SEPARATOR ', ') as phones
      FROM organization o
      JOIN city c ON o.city_id = c.city_id
      JOIN category cat ON o.category_id = cat.category_id
      LEFT JOIN org_phone op ON o.org_id = op.org_id
      GROUP BY o.org_id
      ORDER BY c.city_name, cat.category_name
    `);
    res.render('reports/report3', { organizations: rows });
  } catch (err) {
    console.error(err);
    res.status(500).send('Ошибка отчёта 3');
  }
});

router.get('/by-rubric', async (req, res) => {
  const { category_name } = req.query;
  let data = { category_name: category_name || '' };

  if (category_name) {
    try {
      const [rows] = await db.execute(`
        SELECT 
          o.org_name,
          GROUP_CONCAT(op.phone_number SEPARATOR ', ') as phones,
          c.city_name,
          cat.category_name
        FROM organization o
        JOIN city c ON o.city_id = c.city_id
        JOIN category cat ON o.category_id = cat.category_id
        LEFT JOIN org_phone op ON o.org_id = op.org_id
        WHERE cat.category_name LIKE ?
        GROUP BY o.org_id
        ORDER BY c.city_name
      `, [`%${category_name}%`]);
      data.organizations = rows;
    } catch (err) {
      console.error(err);
      return res.status(500).send('Ошибка отчёта 4');
    }
  }

  res.render('reports/report4', data);
});

module.exports = router;